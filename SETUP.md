# Quick Setup Guide

## Before You Start

**⚠️ IMPORTANT:** You need to provide:
1. **Content Assistant API endpoint** - Where should stories be generated?
2. **Content Assistant API key** - Authentication for the API

The application is ready to use once you add these to your `.env` file.

## Step-by-Step Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Create `.env` File
Copy the example and fill in your values:
```bash
# You'll need to create this manually since .env files are gitignored
```

Required variables:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
CONTENT_API_URL=https://your-content-api.com/generate  # ⚠️ YOU NEED TO PROVIDE THIS
CONTENT_API_KEY=your-api-key-here                      # ⚠️ YOU NEED TO PROVIDE THIS
```

### 3. Run Database Migrations

Go to your Supabase SQL Editor and run:

1. **`migrations/create_story_log_table.sql`** - Creates the table to store generated stories
2. **`migrations/create_high_performers_function.sql`** - Creates optimized query function (recommended)

### 4. Test Locally

```bash
# Test database connection
node -e "import('./src/config/database.js').then(m => m.testConnection().then(r => console.log('Connected:', r)))"

# Generate stories
npm start
```

### 5. Deploy to Vercel

1. Push to GitHub
2. Import in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

The API will be available at: `https://your-project.vercel.app/api/generate-stories`

## Testing the API

Once deployed, test with:

```bash
curl -X POST https://your-project.vercel.app/api/generate-stories \
  -H "Content-Type: application/json" \
  -d '{"year": 2025, "limit": 3}'
```

## Troubleshooting

### "CONTENT_API_URL and CONTENT_API_KEY must be set"
→ Add these to your `.env` file. The Content Assistant API endpoint is required.

### "Database connection failed"
→ Check your `SUPABASE_URL` and `SUPABASE_KEY` are correct.

### "No high performers found"
→ Check that:
- Data exists for the specified year
- Programs have 4+ months of data
- Programs meet 80%+ above goal threshold
- Wonky data exclusions aren't too aggressive

### "Failed to generate story via API"
→ Check:
- `CONTENT_API_URL` is correct and accessible
- `CONTENT_API_KEY` is valid
- API endpoint accepts the payload format (see `src/services/contentAPI.js`)

## Next Steps

Once working, you can:
1. Add the other story types (improvements, efficiency)
2. Set up scheduled runs
3. Build a UI to browse generated stories
4. Add email notifications

