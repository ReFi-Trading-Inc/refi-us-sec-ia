# Reviewed, verified serving artifact.
#
# Built from d9691508c1537824e2aa644438fdd1e8ec3157de on the protected branch
# daniel-handoff/integration — the first image ever built from the reviewed
# line. Cloud Build us-west1/47ff1d18-48bd-4072-ab13-20bb4b43f0e8: SUCCESS.
# Promoted 2026-09-14 to revision refi-frontend-integration-00017-deh at 100%
# traffic, through cloudbuild.connected-cicd.yaml and connected-release.py:
# candidate verified before any traffic, runtime probe passed, release record
# status "verified".
#
# Supersedes sha256:62359b2e…, which was built from 6e5f1be on
# integration/refinity-dev and never had reviewed provenance. Do not pin a
# digest merely because it is serving; pin one whose source is on this line.
image = "us-west1-docker.pkg.dev/refinity-dev/refi-frontend/web@sha256:6726fb2f453267445d6d3bb1fbff13a9b54cd81c607fc56c8bdc478653c5b03e"
