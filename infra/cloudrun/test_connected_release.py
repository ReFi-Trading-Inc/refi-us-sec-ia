"""Local, credential-free tests of release ordering and promotion boundaries."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("release", Path(__file__).with_name("connected-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def exercise_promotion(self, failure):
        build_id, sha = "a" * 36, "b" * 40
        revision = release.SERVICE + "-ci-" + build_id[:20]
        env = {"CB_BUILD_ID": build_id, "CB_SOURCE_SHA": sha, "CB_BRANCH": "integration/refinity-dev"}
        build = {"substitutions": {"COMMIT_SHA": sha, "BRANCH_NAME": env["CB_BRANCH"]},
                 "createTime": "2026-09-11T11:00:00Z"}
        before = {"status": {"traffic": [{"revisionName": "prior", "percent": 100}]}}
        candidate = {"status": {"traffic": [*before["status"]["traffic"],
                     {"tag": "candidate", "revisionName": revision, "url": "https://candidate.invalid"}]}}
        candidate["status"].update(latestReadyRevisionName=revision, latestCreatedRevisionName=revision)
        candidate["spec"] = {"template": {"spec": {"containers": [{"image": release.IMAGE + "@sha256:" + "c" * 64}]}}}
        after = {"status": {"traffic": [{"revisionName": revision, "percent": 100}]}}
        def check(origin):
            if (failure == "candidate" and origin.endswith("candidate.invalid")) or (
                    failure == "promoted" and origin == release.ORIGIN):
                raise ValueError("Deliberate smoke failure")
        with patch.dict(os.environ, env), patch.object(release, "request", return_value=build) as request, \
             patch.object(release, "put_object", return_value={"generation": "42"}), \
             patch.object(release, "read_object", return_value=None), \
             patch.object(release, "describe_service", side_effect=[before, candidate, after]), \
             patch.object(release, "gcloud", return_value="sha256:" + "c" * 64), \
             patch.object(release, "smoke", side_effect=check), patch.object(release, "set_traffic") as traffic:
            if failure:
                with self.assertRaises(ValueError):
                    release.main()
            else:
                release.main()
            # Lock release uses the owned generation, including failures.
            self.assertEqual(request.call_args.args[1], "DELETE")
            self.assertIn("ifGenerationMatch=42", request.call_args.args[0])
            return traffic.call_args_list

    def test_candidate_failure_never_promotes(self):
        self.assertEqual(self.exercise_promotion("candidate"), [])

    def test_failed_public_verification_restores_previous_revision(self):
        calls = self.exercise_promotion("promoted")
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[-1].args[0], {"prior": 100})

    def test_success_promotes_once(self):
        self.assertEqual(len(self.exercise_promotion(None)), 1)

    def test_only_exact_branch_and_full_sha(self):
        release.validate_source("integration/refinity-dev", "a" * 40, "a" * 36)
        for branch in ["main", "integration/refinity-dev-other", "feature/kyc", ""]:
            with self.assertRaises(ValueError):
                release.validate_source(branch, "a" * 40, "a" * 36)
        with self.assertRaises(ValueError):
            release.validate_source("integration/refinity-dev", "a" * 7, "a" * 36)

    def test_older_build_cannot_replace_newer_attempt(self):
        old = {"build_id": "old", "created_at": "2026-09-11T10:00:00Z"}
        new = {"build_id": "new", "created_at": "2026-09-11T11:00:00Z"}
        self.assertTrue(release.newer_than(new, old))
        self.assertFalse(release.newer_than(old, new))
        self.assertTrue(release.newer_than(new, new))
        self.assertTrue(release.newer_than(old, None))

    def test_rollback_uses_resolved_revisions_not_latest(self):
        service = {"status": {"traffic": [
            {"revisionName": "prior", "percent": 100, "latestRevision": True},
            {"revisionName": "candidate", "tag": "candidate"},
        ]}}
        self.assertEqual(release.traffic_revisions(service), {"prior": 100})
        with self.assertRaises(ValueError):
            release.traffic_revisions({"status": {"traffic": []}})

    def test_smoke_checks_both_keys_and_anonymous_refusal(self):
        def response(url, **kwargs):
            self.assertFalse(kwargs["authenticated"])
            if "investor/" in url:
                raise HTTPError(url, 401, "Unauthorized", {}, None)
            if "demo/session" in url:
                raise HTTPError(url, 404, "Not found", {}, None)
            return {"keys": [{"kid": "bridge" if "bridge" in url else "investor"}]}
        with patch.object(release, "request", side_effect=response):
            release.smoke("https://example.invalid")
        with patch.object(release, "request", return_value={"keys": [{"kid": "same"}]}):
            with self.assertRaises(ValueError):
                release.smoke("https://example.invalid")


if __name__ == "__main__":
    unittest.main()
