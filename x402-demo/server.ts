// Demo paid API (Express + x402) on stellar:testnet.
//
// Facilitator: self-hosted by default (see facilitator.ts), with fees paid by
// the `gc-facilitator` testnet identity. Set FACILITATOR=oz-channels (and
// OZ_API_KEY) to use OZ Channels, which currently rejects smart-account
// payments that use OZ's spending-limit policy (docs/spike-notes.md, section 7).
//
//   node --env-file-if-exists=.env.local x402-demo/server.ts
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme as ExactStellarServer } from "@x402/stellar/exact/server";
import { address, keypair } from "../scripts/testnet/lib.ts";
import { selfHostedFacilitator } from "./facilitator.ts";

const NETWORK = "stellar:testnet" as const;
const PORT = Number(process.env.PORT ?? 4021);
const MERCHANT = process.env.MERCHANT_ADDRESS ?? address("gc-merchant"); // allowlisted
const PARTNER = process.env.PARTNER_ADDRESS ?? address("gc-stranger"); // not allowlisted
// Prices are overridable so automated tests don't burn the daily cap.
const REPORT_PRICE = process.env.REPORT_PRICE ?? "$1.00";
const PREMIUM_PRICE = process.env.PREMIUM_PRICE ?? "$15.00"; // above the 10 USDC cap

function facilitatorClient(): { client: FacilitatorClient; label: string } {
  if (process.env.FACILITATOR === "oz-channels") {
    if (!process.env.OZ_API_KEY) throw new Error("FACILITATOR=oz-channels requires OZ_API_KEY");
    const auth = { Authorization: `Bearer ${process.env.OZ_API_KEY}` };
    return {
      label: "OZ Channels",
      client: new HTTPFacilitatorClient({
        url: process.env.FACILITATOR_URL ?? "https://channels.openzeppelin.com/x402/testnet",
        createAuthHeaders: async () => ({ verify: auth, settle: auth, supported: auth }),
      }),
    };
  }
  return { label: "self-hosted", client: selfHostedFacilitator(NETWORK, keypair("gc-facilitator").secret()) };
}

const { client, label } = facilitatorClient();
const resourceServer = new x402ResourceServer(client).register(NETWORK, new ExactStellarServer());

const route = (price: string, payTo: string, description: string) => ({
  accepts: { scheme: "exact", price, network: NETWORK, payTo },
  description,
});

const app = express();
app.use(
  paymentMiddleware(
    {
      // Within policy: allowlisted recipient, under the 10 USDC daily cap.
      "GET /api/report": route(REPORT_PRICE, MERCHANT, "Market report"),
      // Over the daily cap.
      "GET /api/premium-report": route(PREMIUM_PRICE, MERCHANT, "Premium market report"),
      // Recipient not on the agent's allowlist.
      "GET /api/partner-report": route(REPORT_PRICE, PARTNER, "Partner market report"),
    },
    resourceServer,
  ),
);

app.get("/api/report", (_req, res) => res.json({ report: "market", tier: "standard" }));
app.get("/api/premium-report", (_req, res) => res.json({ report: "market", tier: "premium" }));
app.get("/api/partner-report", (_req, res) => res.json({ report: "market", tier: "partner" }));

app.listen(PORT, () => console.log(`Paid API on http://localhost:${PORT} (${NETWORK}, facilitator: ${label})`));
