#!/usr/bin/env python3
"""
🖼️ Google Images Retrieval System
Fetches images from Google Images for mistral/deepseek models
Only activates when advanced models are installed
"""
import os
import sys
import json
import requests
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from urllib.parse import quote_plus
import re

# Colors
PURPLE = "\033[35m"
GREEN = "\033[32m"
RED = "\033[31m"
GOLD = "\033[33m"
BLUE = "\033[34m"
CYAN = "\033[36m"
DIM = "\033[2m"
RESET = "\033[0m"

LUCIFER_HOME = Path.home() / ".luciferai"
IMAGES_DIR = LUCIFER_HOME / "images"


class ImageRetriever:
    """
    Google Images retrieval system.
    
    Features:
    - Fetches images from Google Images
    - Downloads and saves to local cache
    - Returns image paths for AI processing
    - Only works with mistral/deepseek models
    """
    
    def __init__(self):
        self.images_dir = IMAGES_DIR
        self.images_dir.mkdir(parents=True, exist_ok=True)
        
        # Cache file for image metadata
        self.cache_file = self.images_dir / "image_cache.json"
        self.cache = self._load_cache()
        
        # Check if advanced model is available
        self.available = self._check_model_availability()
    
    def _check_model_availability(self) -> bool:
        """Check if mistral or deepseek-coder is installed."""
        try:
            response = requests.get("http://localhost:11434/api/tags", timeout=1)
            if response.status_code == 200:
                models = response.json().get('models', [])
                available_models = [m['name'] for m in models]
                
                # Check for advanced models
                for model in available_models:
                    if 'mistral' in model.lower() or 'deepseek' in model.lower():
                        return True
                
                return False
        except:
            return False
    
    def _load_cache(self) -> Dict:
        """Load image cache from disk."""
        if self.cache_file.exists():
            try:
                with open(self.cache_file, 'r') as f:
                    return json.load(f)
            except:
                return {}
        return {}
    
    def _save_cache(self):
        """Save image cache to disk."""
        try:
            with open(self.cache_file, 'w') as f:
                json.dump(self.cache, f, indent=2)
        except Exception as e:
            print(f"{RED}⚠️  Failed to save image cache: {e}{RESET}")
    
    def search_images(self, query: str, num_results: int = 5) -> List[Dict]:
        """
        Search Google Images and return image URLs.
        
        Args:
            query: Search query (e.g., "cute cats", "python logo")
            num_results: Number of images to fetch (default 5, max 20)
        
        Returns:
            List of dicts with 'url', 'title', 'source' keys
        """
        if not self.available:
            print(f"{GOLD}⚠️  Image retrieval requires mistral or deepseek-coder{RESET}")
            print(f"{BLUE}Install with: {CYAN}install mistral{RESET}")
            return []
        
        # Check cache first
        cache_key = f"{query.lower()}:{num_results}"
        if cache_key in self.cache:
            print(f"{DIM}📦 Using cached results for '{query}'{RESET}")
            return self.cache[cache_key]
        
        print(f"{CYAN}🔍 Searching Google Images for: {query}{RESET}")
        
        try:
            # Use Google Images search (scraping approach)
            search_url = f"https://www.google.com/search?q={quote_plus(query)}&tbm=isch"
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            
            response = requests.get(search_url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                print(f"{RED}❌ Failed to fetch images (status {response.status_code}){RESET}")
                return []
            
            # Extract image URLs from response
            images = self._extract_image_urls(response.text, num_results)
            
            if images:
                print(f"{GREEN}✅ Found {len(images)} images{RESET}")
                
                # Cache results
                self.cache[cache_key] = images
                self._save_cache()
                
                return images
            else:
                print(f"{GOLD}⚠️  No images found for '{query}'{RESET}")
                return []
        
        except Exception as e:
            print(f"{RED}❌ Error searching images: {e}{RESET}")
            return []
    
    def _extract_image_urls(self, html: str, limit: int) -> List[Dict]:
        """Extract image URLs from Google Images HTML."""
        images = []
        
        # Find image data in HTML (Google Images stores it in JSON format)
        # Look for patterns like ["https://...",width,height]
        pattern = r'\["(https?://[^"]+\.(?:jpg|jpeg|png|gif|webp)[^"]*)"'
        
        matches = re.findall(pattern, html, re.IGNORECASE)
        
        seen_urls = set()
        for url in matches:
            if url not in seen_urls and len(images) < limit:
                # Clean URL
                clean_url = url.split('&')[0]  # Remove tracking params
                
                images.append({
                    'url': clean_url,
                    'title': f"Image {len(images) + 1}",
                    'source': 'Google Images'
                })
                seen_urls.add(url)
        
        return images
    
    def download_image(self, image_url: str, filename: Optional[str] = None) -> Optional[str]:
        """
        Download image from URL and save locally.
        
        Args:
            image_url: URL of the image
            filename: Optional custom filename (auto-generated if None)
        
        Returns:
            Path to downloaded image, or None if failed
        """
        if not self.available:
            return None
        
        try:
            # Generate filename if not provided
            if not filename:
                # Use hash of URL as filename
                import hashlib
                url_hash = hashlib.md5(image_url.encode()).hexdigest()[:12]
                
                # Extract extension from URL
                ext = 'jpg'
                for e in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
                    if e in image_url.lower():
                        ext = e[1:]
                        break
                
                filename = f"{url_hash}.{ext}"
            
            filepath = self.images_dir / filename
            
            # Check if already downloaded
            if filepath.exists():
                print(f"{DIM}📦 Image already cached: {filename}{RESET}")
                return str(filepath)
            
            print(f"{CYAN}📥 Downloading image...{RESET}")
            
            # Download image
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
            
            response = requests.get(image_url, headers=headers, timeout=15, stream=True)
            
            if response.status_code == 200:
                with open(filepath, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                print(f"{GREEN}✅ Image saved: {filepath}{RESET}")
                return str(filepath)
            else:
                print(f"{RED}❌ Failed to download (status {response.status_code}){RESET}")
                return None
        
        except Exception as e:
            print(f"{RED}❌ Error downloading image: {e}{RESET}")
            return None
    
    def fetch_and_download(self, query: str, num_images: int = 3) -> List[str]:
        """
        Search for images and download them.
        
        Args:
            query: Search query
            num_images: Number of images to download
        
        Returns:
            List of local file paths
        """
        if not self.available:
            print(f"{GOLD}⚠️  Image retrieval requires mistral or deepseek-coder{RESET}")
            return []
        
        # Search for images
        results = self.search_images(query, num_images)
        
        if not results:
            return []
        
        # Download each image
        downloaded = []
        for i, img in enumerate(results, 1):
            print(f"\n{BLUE}Image {i}/{len(results)}{RESET}")
            path = self.download_image(img['url'])
            if path:
                downloaded.append(path)
        
        return downloaded
    
    def clear_cache(self):
        """Clear image cache and downloaded images."""
        try:
            # Remove all cached images
            for img_file in self.images_dir.glob("*"):
                if img_file.is_file() and img_file != self.cache_file:
                    img_file.unlink()
            
            # Clear cache metadata
            self.cache = {}
            self._save_cache()
            
            print(f"{GREEN}✅ Image cache cleared{RESET}")
        except Exception as e:
            print(f"{RED}❌ Error clearing cache: {e}{RESET}")
    
    def list_cached_images(self):
        """List all cached images."""
        images = list(self.images_dir.glob("*.jpg")) + \
                 list(self.images_dir.glob("*.png")) + \
                 list(self.images_dir.glob("*.gif")) + \
                 list(self.images_dir.glob("*.webp"))
        
        if not images:
            print(f"{GOLD}No cached images{RESET}")
            return
        
        print(f"\n{PURPLE}📂 Cached Images ({len(images)} total):{RESET}\n")
        
        for img in sorted(images):
            size = img.stat().st_size / 1024  # KB
            print(f"  🖼️  {img.name} ({size:.1f} KB)")
        
        print(f"\n{DIM}Location: {self.images_dir}{RESET}")


def get_image_retriever() -> ImageRetriever:
    """Get singleton instance of ImageRetriever."""
    if not hasattr(get_image_retriever, '_instance'):
        get_image_retriever._instance = ImageRetriever()
    return get_image_retriever._instance


# CLI for testing
if __name__ == "__main__":
    print(f"{PURPLE}╔════════════════════════════════════════╗{RESET}")
    print(f"{PURPLE}║   🖼️  Google Images Retrieval System   ║{RESET}")
    print(f"{PURPLE}╚════════════════════════════════════════╝{RESET}\n")
    
    retriever = ImageRetriever()
    
    if not retriever.available:
        print(f"{RED}❌ Advanced model required{RESET}")
        print(f"{GOLD}Install mistral or deepseek-coder to use image retrieval{RESET}")
        sys.exit(1)
    
    if len(sys.argv) < 2:
        print(f"{GOLD}Usage:{RESET}")
        print(f"  {sys.argv[0]} search <query>     - Search for images")
        print(f"  {sys.argv[0]} download <query>   - Search and download")
        print(f"  {sys.argv[0]} list              - List cached images")
        print(f"  {sys.argv[0]} clear             - Clear cache")
        sys.exit(0)
    
    command = sys.argv[1].lower()
    
    if command == "search" and len(sys.argv) > 2:
        query = " ".join(sys.argv[2:])
        results = retriever.search_images(query)
        
        if results:
            print(f"\n{GREEN}Results:{RESET}\n")
            for i, img in enumerate(results, 1):
                print(f"{i}. {img['url']}")
    
    elif command == "download" and len(sys.argv) > 2:
        query = " ".join(sys.argv[2:])
        paths = retriever.fetch_and_download(query, num_images=5)
        
        if paths:
            print(f"\n{GREEN}✅ Downloaded {len(paths)} images:{RESET}\n")
            for path in paths:
                print(f"  📁 {path}")
    
    elif command == "list":
        retriever.list_cached_images()
    
    elif command == "clear":
        retriever.clear_cache()
    
    else:
        print(f"{RED}❌ Invalid command{RESET}")
