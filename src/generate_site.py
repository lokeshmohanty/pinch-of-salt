"""
Generates a static HTML site from RSS feeds for GitHub Pages
"""

import os
import sys
from datetime import datetime
from pathlib import Path
import re

from rss import load_feeds_from_yaml, fetch_rss_feeds

def generate_html(sources, articles, output_dir='docs', template_path='src/static.html'):
    """Generate static HTML files from articles"""
    
    sources = [source["name"] for source in sources]

    # Create output directory
    Path(output_dir).mkdir(exist_ok=True)
    
    # Get unique tags
    all_tags = set()
    for article in articles:
        all_tags.update(article['tags'])
    tags = sorted(list(all_tags))
    
    # Load HTML template
    with open(template_path, 'r', encoding='utf-8') as f:
        template = f.read()
    
    # Generate source filter buttons
    source_buttons_html = '<button class="filter-btn active" data-type="source" data-value="all">All Sources</button>\n'
    for source in sources:
        source_buttons_html += f'                <button class="filter-btn" data-type="source" data-value="{source}">{source}</button>\n'
    
    # Generate tag filter buttons
    tag_buttons_html = '<button class="filter-btn active" data-type="tag" data-value="all">All Tags</button>\n'
    for tag in tags:
        tag_buttons_html += f'                <button class="filter-btn" data-type="tag" data-value="{tag}">{tag.title()}</button>\n'
    
    # Generate article cards
    articles_html = ''
    for article in articles:
        tags_html = ''.join([f'<span class="tag">{tag}</span>' for tag in article['tags']])
        tags_data = ','.join(article['tags'])
        
        # Truncate description
        description = article['description']
        if len(description) > 250:
            description = description[:250] + '...'
        
        articles_html += f"""
            <div class="article-card" data-source="{article['source']}" data-tags="{tags_data}">
                <span class="article-source">{article['source']}</span>
                <h2 class="article-title">
                    <a href="{article['link']}" target="_blank" rel="noopener noreferrer">
                        {article['title']}
                    </a>
                </h2>
                <p class="article-description">{description}</p>
                <div class="article-meta">
                    <div class="article-tags">{tags_html}</div>
                    <span class="article-date">{article['published']}</span>
                </div>
            </div>
        """
    
    # Get current update time
    update_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')
    
    # Replace placeholders in template
    html_content = template.replace('{{SOURCE_FILTERS}}', source_buttons_html)
    html_content = html_content.replace('{{TAG_FILTERS}}', tag_buttons_html)
    html_content = html_content.replace('{{ARTICLES}}', articles_html)
    html_content = html_content.replace('{{UPDATE_TIME}}', update_time)
    html_content = html_content.replace('{{ARTICLE_COUNT}}', str(len(articles)))
    
    # Write to file
    output_file = os.path.join(output_dir, 'index.html')
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"✅ Generated {output_file} with {len(articles)} articles")
    
    # # Generate .nojekyll file (tells GitHub Pages to serve files as-is)
    # nojekyll_file = os.path.join(output_dir, '.nojekyll')
    # Path(nojekyll_file).touch()
    # print(f"✅ Created {nojekyll_file}")

def main():
    """Main execution function"""
    print("🚀 Starting static site generation...")
    
    # Load feed sources from YAML
    feed_sources = load_feeds_from_yaml('data/feeds.yaml')
    print(f"📋 Loaded {len(feed_sources)} feed sources")
    
    # Fetch articles
    articles = fetch_rss_feeds(feed_sources, max_articles_per_source=15)
    print(f"📰 Fetched {len(articles)} total articles")
    
    # Generate static HTML
    generate_html(feed_sources, articles, output_dir='docs', template_path='src/static.html')
    
    print("\n✨ Done! Your site is ready in the 'docs' folder.")
    print("📖 To deploy to GitHub Pages:")
    print("   1. Commit and push the 'docs' folder to GitHub")
    print("   2. Go to Settings > Pages")
    print("   3. Set Source to 'Deploy from a branch'")
    print("   4. Select 'main' branch and '/docs' folder")
    print("   5. Save and wait a few minutes")

if __name__ == '__main__':
    main()
