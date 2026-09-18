# Financial-data setup for Thesis

Checked September 18, 2026. Start with the existing free collection paths. The current 6–18 month workflow benefits first from reliable filings, dated macro data and daily prices. A paid live-price feed does not solve the missing consensus/peer-valuation evidence.

## Existing connections

`npm run analyst -- doctor` currently reports `SEC_USER_AGENT`, `FRED_API_KEY` and `MASSIVE_API_KEY` all absent. The collector already supports these settings; no model API key is needed for collection.

| Source | First setup | What the current collector obtains |
| --- | --- | --- |
| SEC EDGAR | Set an application identifier with your real contact email | Issuer identity, filing discovery and reported XBRL facts |
| FRED/ALFRED | Register a FRED account and request an application API key | Dated macro observations with a requested historical vintage |
| Massive | Create a free account and obtain a stocks API key | Ticker identity and completed historical daily price bars |

SEC's public data APIs need no authentication or API key. They expose submissions and standardized company facts; company-specific tags and financial notes still need examination. See [SEC APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) and [automated-access guidance](https://www.sec.gov/about/developer-resources).

Request a FRED key through [your FRED account](https://fredaccount.stlouisfed.org/apikeys). FRED requires a key and recommends a distinct key for each application. See [key documentation](https://fred.stlouisfed.org/docs/api/api_key.html).

[Massive Stocks Basic](https://massive.com/stocks) currently advertises $0/month, end-of-day data, two years of history and five requests per minute. Its historical bars and identity endpoints must still be checked using your account. Real-time data has separate paid entitlements and agreements; it is not required for this initial test. The collector spaces Massive requests to respect the free rate limit. Provider plan terms can change.

## Local configuration

Edit `.env.local` in the repository root, preserving any existing unrelated settings. Store secrets locally, not in conversation or committed documentation. This repository already ignores `.env*` except `.env.example`.

```dotenv
# Fill these locally. Empty values leave the provider unconfigured.
# SEC_USER_AGENT should identify Thesis and include your real contact email.
SEC_USER_AGENT=""
FRED_API_KEY=""
MASSIVE_API_KEY=""
```

No `NEXT_PUBLIC_` prefix: these are server/CLI settings. The current CLI loads `.env.local` itself.

Run:

```powershell
npm run analyst -- doctor
```

This reports presence only. It does not validate a key, the SEC identifier, account entitlements or network access.

Once the settings are present, perform one collection-only smoke check in a new directory:

```powershell
$dataCheckStamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$dataCheckDirectory = "experiments/data-connection-checks/AVGO-$dataCheckStamp"
npm run analyst -- collect --ticker AVGO --out $dataCheckDirectory
```

This command performs retrieval and writes artifacts; it does not dispatch research agents. Review component statuses and gaps in `retrieval-packet.json`, rather than assuming a successful command means all providers worked. Keep the old AVGO report immutable.

Acceptance checks:

- SEC resolves AVGO/Broadcom to the expected issuer and returns filings/facts with original periods, units and accessions.
- FRED returns numeric observations and the requested vintage; null observations are not zeros. Defaults currently include DGS10, FEDFUNDS, CPIAUCSL and UNRATE.
- Massive resolves the US ticker, currency and exchange and returns adequate completed daily history with explicit adjustment basis. A daily-bar timestamp identifies the aggregate window, not a certified live closing quote. The current collector excludes the cutoff's New York calendar date.
- Failure messages and saved URLs contain no API keys; any 401/403/429 or coverage gap is recorded and resolved or disclosed.
- No model call, report import, historical-run overwrite or paid subscription is needed for this check.

## The separate expectations-data gap

These three connectors do not currently collect analyst consensus, estimate revisions, historical forward multiples or complete earnings-call transcripts. Buying or connecting another provider does not automatically add an adapter to Thesis.

Before purchasing estimates coverage, test a small AVGO peer panel and require fiscal-period labels, forecast publication/as-of date, earnings definition, analyst counts/dispersion and export/API availability. Check whether historical snapshots really preserve what was known then; a forecast target year is not a consensus-vintage timestamp. Revisions can be tracked prospectively from saved snapshots if historical coverage is absent, but cannot be reconstructed honestly from today's estimates alone.

Start with dated public investor-relations materials and accessible estimate pages, recording gaps. Pay only if a provider demonstrates the missing fields on the exact tickers and intended plan. No lowest-priced paid provider has yet been established, and no purchase is recommended on an untested feature list.

Massive and Bigdata.com are optional available chat integrations, not confirmed connections. Massive aligns with the existing price provider. Bigdata.com advertises searchable financial news, filings and transcripts and could be evaluated for the evidence gap; do not assume its account includes every source, structured historical consensus or unlimited usage. Prefer document retrieval over paying for a second generated research report. API access, plugin access and permission to display provider data in an application are separate questions.

## Free YouTube and social transcript tools

The user already has free GitHub tools that produce useful transcripts. Keep them as candidates. The desired output is original source metadata plus timestamped text, not a visually edited video clip. Exact repositories have not yet been supplied or inspected.

For an initial pilot, choose a few issuer channels and original executive/industry interviews. Retrieve on demand, deduplicate by original source/event, and extract only passages that change revenue, margins, financing, competition or expectations. Preserve the full transcript on disk and inspect surrounding context for decisive claims. Record automatic-transcription uncertainty, especially numbers, percentages, speaker attribution and negation.

Store original URL, channel/speaker, event date, upload date, retrieval time, transcript method and timestamp range. Treat reposted clips and influencer opinions as leads, not independent confirmation. A transcript tool is not automatically a real-time news-discovery service.

YouTube's official caption-download API requires permission to edit the video, so it is not a general API for downloading every public video's transcript. Verify how a particular third-party tool obtains text rather than assuming a YouTube API key fixes coverage. See [YouTube caption-download documentation](https://developers.google.com/youtube/v3/docs/captions/download).

Suggested pilot checks: one earnings call, one executive interview, one repost of an older event and one transcript with a financially material number. Check attribution, timestamp accuracy, duplication, numeric accuracy and whether useful evidence was obtained at lower total retrieval/model cost. Do not ingest an unlimited feed or add recurring monitoring as part of setup.
