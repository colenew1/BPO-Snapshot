# Brand Snapshot Dashboard

A Node.js application that generates performance snapshots comparing periods with coaching insights. This replaces the n8n workflow with a standalone, maintainable codebase.

## Features

- **Period Comparison**: Compare month-over-month or quarter-over-quarter performance
- **Coaching Analysis**: Automatically analyzes behavioral coaching data with month shifting
- **AI Summaries**: Generates executive summaries using OpenAI
- **Data Quality**: Tracks data points and coaching coverage
- **Beautiful UI**: Modern, responsive dashboard interface

## Prerequisites

- Node.js 18+
- Supabase account with access to:
  - `monthly_metrics` table
  - `behavioral_coaching` table
  - `metric_snapshots` table (for saving snapshots)
- OpenAI API key (for AI summaries)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here

# OpenAI (for AI summaries)
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini

# Optional
LOG_LEVEL=info
```

### 3. Database Setup

Ensure your Supabase database has:
- `monthly_metrics` table
- `behavioral_coaching` table
- `metric_snapshots` table (for saving snapshots)

## Usage

### Local Development

1. Start a local server (you can use `vercel dev` or any static file server):

```bash
# Using Vercel CLI (recommended)
npx vercel dev

# Or using a simple HTTP server
npx serve public
```

2. Open `http://localhost:3000` (or the port your server uses)

3. Fill out the form and click "Generate Snapshot"

### Vercel Deployment

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

The dashboard will be available at: `https://your-project.vercel.app`

## API Endpoint

The snapshot API is available at: `POST /api/snapshot`

**Request Body:**
```json
{
  "clients": ["TTEC"],
  "organization": "UHC",
  "metric_name": "NPS",
  "year": 2025,
  "comparison_type": "month",
  "current_month": "Jul",
  "previous_month": "Jun"
}
```

**Response:**
```json
{
  "snapshot_metadata": {
    "clients": "TTEC",
    "organization": "UHC",
    "metric": "NPS",
    "comparison": {
      "current_period": "Jul 2025",
      "previous_period": "Jun 2025",
      "current_value": "79.09",
      "previous_value": "77.46",
      "change": "1.63",
      "percent_change": "2.10%"
    },
    "programs_count": 3,
    "data_quality": { ... }
  },
  "coaching_activity": {
    "current": { ... },
    "previous": { ... },
    "change": { ... }
  },
  "ai_summary": "..."
}
```

## Calculation Logic

The application replicates the exact calculation logic from the n8n workflow:

1. **Period Determination**: Maps quarters to months, handles month/quarter selection
2. **Month Shifting**: Coaching data is shifted back by 1 month (coaching drives future performance)
3. **Metric Aggregation**: Calculates averages for current and previous periods
4. **Coaching Aggregation**: Groups behaviors, calculates effectiveness, includes sub-behaviors
5. **Change Calculations**: Computes absolute and percentage changes

## Project Structure

```
Brand Snapshot/
├── public/
│   └── index.html          # Frontend dashboard
├── api/
│   ├── snapshot.js        # Snapshot API endpoint
│   └── index.js           # Serves HTML dashboard
├── src/
│   ├── config/
│   │   └── database.js    # Supabase connection
│   ├── services/
│   │   ├── snapshotProcessor.js  # Core calculation logic
│   │   ├── openaiService.js      # OpenAI integration
│   │   └── snapshotStorage.js    # Save to database
│   └── utils/
│       └── logger.js      # Logging utility
├── .env                   # Environment variables
├── package.json
├── vercel.json
└── README.md
```

## Key Features

### Month Shifting Logic
Coaching data is automatically shifted back by 1 month because coaching drives future performance. For example:
- If comparing Jul vs Jun performance
- Current coaching period = Jun (shifted from Jul)
- Previous coaching period = May (shifted from Jun)

### Sub-Behavior Breakdown
Each top behavior includes a breakdown of sub-behaviors with session counts and percentages.

### AI Summary Generation
Uses OpenAI to generate executive summaries that:
- Connect coaching actions to performance outcomes
- Frame results in the best possible light
- Follow specific tone guidelines

## Troubleshooting

### "Database connection failed"
→ Check your `SUPABASE_URL` and `SUPABASE_KEY` are correct

### "No data found"
→ Verify:
- Data exists for the selected organization, metric, and year
- Client names match exactly (case-sensitive)
- Month/quarter selections are valid

### "AI summary not generated"
→ Check:
- `OPENAI_API_KEY` is set correctly
- You have OpenAI API credits
- The API call isn't being rate-limited

### Frontend can't find API
→ In local development, the frontend tries to detect localhost vs production. Make sure:
- Local: API should be at `http://localhost:3000/api/snapshot`
- Production: API is at `/api/snapshot` (relative path)

## License

MIT
