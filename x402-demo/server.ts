// Demo paid API (Express + x402) on stellar:testnet.
//
// Facilitator: OZ Channels when OZ_API_KEY is set, otherwise a local in-process
// facilitator running @x402/stellar's facilitator scheme (dev only), with fees
// paid by the `gc-facilitator` testnet identity.
//
//   node --env-file-if-exists=.env.local x402-demo/server.ts
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme as ExactStellarServer } from "@x402/stellar/exact/server";
import { ExactStellarScheme as ExactStellarFacilitator } from "@x402/stellar/exact/facilitator";
import { address, keypair } from "../scripts/testnet/lib.ts";

const NETWORK = "stellar:testnet" as const;
const PORT = Number(process.env.PORT ?? 4021);
const MERCHANT = process.env.MERCHANT_ADDRESS ?? address("gc-merchant"); // allowlisted
const PARTNER = process.env.PARTNER_ADDRESS ?? address("gc-stranger"); // not allowlisted

function facilitatorClient(): { client: FacilitatorClient; label: string } {
  if (process.env.OZ_API_KEY) {
    const auth = { Authorization: `Bearer ${process.env.OZ_API_KEY}` };
    return {
      label: "OZ Channels",
      client: new HTTPFacilitatorClient({
        url: process.env.FACILITATOR_URL ?? "https://channels.openzeppelin.com/x402/testnet",
        createAuthHeaders: async () => ({ verify: auth, settle: auth, supported: auth }),
      }),
    };
  }
  const signer = createEd25519Signer(keypair("gc-facilitator").secret(), NETWORK);
  // A smart-account payment (check_auth + verifier + two policies) costs ~0.03 XLM
  // in resource fees, above the scheme's 0.005 XLM default cap.
  const scheme = new ExactStellarFacilitator([signer], { maxTransactionFeeStroops: 1_000_000 });
  const local = new x402Facilitator().register(NETWORK, scheme);
  return {
    label: "local (dev only)",
    client: {
      verify: (payload, requirements) => local.verify(payload, requirements),
      settle: (payload, requirements) => local.settle(payload, requirements),
      getSupported: async () => local.getSupported() as Awaited<ReturnType<FacilitatorClient["getSupported"]>>,
    },
  };
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
      "GET /api/report": route("$1.00", MERCHANT, "Market report"),
      // Over the daily cap.
      "GET /api/premium-report": route("$15.00", MERCHANT, "Premium market report"),
      // Recipient not on the agent's allowlist.
      "GET /api/partner-report": route("$1.00", PARTNER, "Partner market report"),
    },
    resourceServer,
  ),
);

app.get("/api/report", (_req, res) => res.json({ report: "market", tier: "standard" }));
app.get("/api/premium-report", (_req, res) => res.json({ report: "market", tier: "premium" }));
app.get("/api/partner-report", (_req, res) => res.json({ report: "market", tier: "partner" }));

app.listen(PORT, () => console.log(`Paid API on http://localhost:${PORT} (${NETWORK}, facilitator: ${label})`));
