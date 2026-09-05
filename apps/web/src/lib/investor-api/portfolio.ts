/**
 * Account truth READS through the frozen v1.1.0-alpha.2 client (C1b-2 rows
 * 15, 16, 24 and the preference read): `getAccountValuation`,
 * `listAccountValuations` (bounded history), `listAccountPositions`,
 * `listAccountMemberships`, `getTemplate`, `getAccountPreferences`.
 *
 * Decimal strings stay strings. Nothing here computes account truth from
 * browser data; the backend's reconciled valuation is the only source.
 */
import type { OperationResponse } from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "./demo-client";
import { collectPages, CONTRACT_MAX_PAGE_SIZE } from "./pagination";

type Valuation = OperationResponse<"getAccountValuation">["data"];
type Position =
  OperationResponse<"listAccountPositions">["data"]["items"][number];
type Membership =
  OperationResponse<"listAccountMemberships">["data"]["items"][number];
type Template = OperationResponse<"getTemplate">["data"];
type Preferences = OperationResponse<"getAccountPreferences">["data"];

export interface ValuationView {
  asOf: string;
  equity: string;
  cash: string;
  buyingPower: string;
  positionCount: number;
  openOrderCount: number;
  freshness: Valuation["freshness_status"];
  environment: Valuation["account_environment"];
  reconciliationHold: string;
  managementScope: string;
}

export interface ValuationPointView {
  asOf: string;
  equity: string;
}

export interface PositionView {
  symbol: string;
  displayName: string;
  securityId: string;
  heldQty: string;
  averagePrice: string;
  referencePrice: string;
  marketValue: string;
  pendingBuyQty: string;
  pendingSellQty: string;
  freshness: Position["freshness_status"];
}

export interface MembershipView {
  templateId: string;
  templateName: string | null;
  constituentCount: number | null;
  status: Membership["status"];
  allocationPercent: string | null;
  allocationVersion: number | null;
  effectiveFrom: string;
}

export interface PreferencesView {
  version: number;
  driftThreshold: string;
  minOrder: string;
  excludedAssets: string[];
  fractionalEnabled: boolean;
  updatedAt: string;
}

export interface PortfolioView {
  valuation: ValuationView;
  history: ValuationPointView[];
  positions: PositionView[];
  memberships: MembershipView[];
  preferences: PreferencesView;
}

export const VALUATION_HISTORY_MAX_PAGES = 1;
export const POSITIONS_MAX_PAGES = 5;

export function projectValuation(v: Valuation): ValuationView {
  return {
    asOf: v.as_of_time,
    equity: v.equity,
    cash: v.cash,
    buyingPower: v.buying_power,
    positionCount: v.position_count,
    openOrderCount: v.open_order_count,
    freshness: v.freshness_status,
    environment: v.account_environment,
    reconciliationHold: v.reconciliation_hold_status,
    managementScope: v.management_scope_status,
  };
}

export function projectPosition(p: Position): PositionView {
  return {
    symbol: p.symbol,
    displayName: p.display_name,
    securityId: p.security_id,
    heldQty: p.held_qty,
    averagePrice: p.average_price,
    referencePrice: p.reference_price,
    marketValue: p.market_value,
    pendingBuyQty: p.pending_buy_qty,
    pendingSellQty: p.pending_sell_qty,
    freshness: p.freshness_status,
  };
}

export function projectPreferences(p: Preferences): PreferencesView {
  return {
    version: p.version,
    driftThreshold: p.drift_threshold,
    minOrder: p.min_order,
    excludedAssets: [...p.excluded_assets],
    fractionalEnabled: p.fractional_enabled,
    updatedAt: p.updated_at,
  };
}

export async function getPortfolio(
  client: InvestorApiReadClient,
  accountId: string,
): Promise<PortfolioView> {
  const [valuation, history, positions, memberships, prefs] = await Promise.all(
    [
      client.call("getAccountValuation", { path: { account_id: accountId } }),
      collectPages(
        async (cursor) => {
          const res = await client.call("listAccountValuations", {
            path: { account_id: accountId },
            query: { page_size: CONTRACT_MAX_PAGE_SIZE, cursor },
          });
          return { items: res.data.data.items, page: res.data.data.page };
        },
        { maxPages: VALUATION_HISTORY_MAX_PAGES },
      ),
      collectPages(
        async (cursor) => {
          const res = await client.call("listAccountPositions", {
            path: { account_id: accountId },
            query: { page_size: CONTRACT_MAX_PAGE_SIZE, cursor },
          });
          return { items: res.data.data.items, page: res.data.data.page };
        },
        { maxPages: POSITIONS_MAX_PAGES },
      ),
      client.call("listAccountMemberships", {
        path: { account_id: accountId },
        query: { page_size: CONTRACT_MAX_PAGE_SIZE },
      }),
      client.call("getAccountPreferences", { path: { account_id: accountId } }),
    ],
  );

  const templates = new Map<string, Template>();
  for (const m of memberships.data.data.items) {
    if (!templates.has(m.template_id)) {
      try {
        const t = await client.call("getTemplate", {
          path: { template_id: m.template_id },
        });
        templates.set(m.template_id, t.data.data);
      } catch {
        // Template name is presentation only; the membership is still shown.
      }
    }
  }

  return {
    valuation: projectValuation(valuation.data.data),
    history: history.items
      .map((v) => ({ asOf: v.as_of_time, equity: v.equity }))
      .sort((a, b) => a.asOf.localeCompare(b.asOf)),
    positions: positions.items
      .map(projectPosition)
      .sort((a, b) => Number(b.marketValue) - Number(a.marketValue)),
    memberships: memberships.data.data.items.map((m) => ({
      templateId: m.template_id,
      templateName: templates.get(m.template_id)?.name ?? null,
      constituentCount: templates.get(m.template_id)?.constituent_count ?? null,
      status: m.status,
      allocationPercent: m.allocation_percent,
      allocationVersion: m.allocation_version,
      effectiveFrom: m.effective_from,
    })),
    preferences: projectPreferences(prefs.data.data),
  };
}
