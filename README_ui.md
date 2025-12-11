# News with a pinch of salt 🧂 (Static Site)

A static site generator that fetches RSS feeds and creates a beautiful, filterable web page hosted on GitHub Pages. Take everything you read with a healthy dose of skepticism!

## Features

- 📰 Aggregates multiple RSS feeds into one page
- 🗂️ Filter by source and tag
- ⏰ Articles sorted by publication date (newest first)
- 🎨 Modern, responsive design
- 🤖 Automatic updates via GitHub Actions
- 🚀 Zero-cost hosting on GitHub Pages

## Setup

### 1. Local Setup

```bash
# Clone the repository
git clone https://github.com/lokeshmohanty/pinch-of-salt.git
cd pinch-of-salt

# Install dependencies
uv sync

# Generate the site
uv run generate_site.py
```

### 2. Configure Feeds

Edit `data/feeds.yaml` to add your RSS feeds:

```yaml
feeds:
  - name: "Your Feed Name"
    url: "https://example.com/feed.xml"
    tags: ["tag1", "tag2", "tag3"]
```

### 3. Deploy to GitHub Pages

1. Push your code to GitHub
2. Go to **Settings** → **Pages**
3. Under **Source**, select:
   - Branch: `main`
   - Folder: `/docs`
4. Click **Save**
5. Your site will be available at `https://lokeshmohanty.github.io/pinch-of-salt/`

### 4. Enable Auto-Updates

The included GitHub Action automatically updates your feeds every 6 hours. To enable:

1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select "Read and write permissions"
3. Click **Save**

The workflow will:
- Fetch latest articles every 6 hours
- Regenerate the static site
- Commit and push changes automatically

## Manual Update

You can manually trigger an update:

1. Go to **Actions** tab
2. Select "Update RSS Feeds"
3. Click "Run workflow"

## Customization

### Styling

Edit `src/static.html` to customize:
- Colors and theme
- Fonts and typography
- Layout and spacing
- Filter appearance
- Card design

### Article Limits

Change the number of articles per feed:

```python
articles = fetch_rss_feeds(feed_sources, max_articles_per_source=20)
```

### Update Frequency

Edit `.github/workflows/update-feeds.yml`:

```yaml
schedule:
  - cron: '0 */3 * * *'  # Every 3 hours
```

## Technologies

- **Python**: RSS parsing and static site generation
- **feedparser**: RSS/Atom feed parsing
- **PyYAML**: Configuration management
- **GitHub Actions**: Automated updates
- **GitHub Pages**: Free static site hosting
