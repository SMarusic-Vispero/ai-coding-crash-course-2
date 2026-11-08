import type { SalesAnalytics } from "~/services/courseAnalyticsService";
import { COUNTRIES } from "~/lib/ppp";
import { formatCents } from "~/lib/utils";
import { SectionCard, SectionEmpty, StatTile } from "./shared";

// ─── Sales section ───
// Team seats sold vs. redeemed and revenue by buyer country. Free courses show
// a message instead. Total revenue, purchases and average price paid live in
// the headline section; the revenue trend line lives in the trends section.

const countryNames = new Map(COUNTRIES.map(({ code, name }) => [code, name]));

function countryName(code: string | null): string {
  if (code === null) return "Unknown";
  return countryNames.get(code) ?? code;
}

export function SalesSection({
  sales,
  isFree,
}: {
  sales: SalesAnalytics;
  isFree: boolean;
}) {
  if (isFree) {
    return (
      <SectionCard title="Sales">
        <SectionEmpty title="This is a free course — no sales data" />
      </SectionCard>
    );
  }

  if (sales.purchases === 0) {
    return (
      <SectionCard title="Sales" description="All time">
        <SectionEmpty
          title="No sales yet"
          body="Team seats and revenue by country appear here once someone buys the course."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Sales" description="All time">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatTile
            label="Team seats sold"
            value={sales.teamSeatsSold.toLocaleString()}
          />
          <StatTile
            label="Team seats redeemed"
            value={sales.teamSeatsRedeemed.toLocaleString()}
            hint={
              sales.teamSeatsSold > 0
                ? `${(sales.teamSeatsSold - sales.teamSeatsRedeemed).toLocaleString()} unused`
                : "No team purchases yet"
            }
          />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">Revenue by country</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Country</th>
                  <th className="px-4 py-2 text-right font-medium">Purchases</th>
                  <th className="px-4 py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sales.byCountry.map((row) => (
                  <tr key={row.country ?? "unknown"} className="border-b last:border-0">
                    <td className="px-4 py-2">{countryName(row.country)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.purchases.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatCents(row.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
