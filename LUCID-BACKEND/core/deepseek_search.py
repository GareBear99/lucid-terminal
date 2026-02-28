"""
Deepseek Advanced Search System
Performs advanced searches on StackOverflow, GitHub, and documentation sites
Discovers fixes, consolidates them, and updates local/consensus knowledge
"""

import os
import json
import subprocess
import re
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from github_integration import GitHubIntegration
from task_orchestrator import Task, SubTask, NextStep, TaskPriority, TaskOrchestrator

class DeepseekSearchSystem:
    """Advanced search and fix discovery system for deepseek"""
    
    def __init__(self, consensus_dir: str = None):
        self.consensus_dir = consensus_dir or os.path.expanduser("~/.luciferai/consensus")
        self.fixes_dir = os.path.join(self.consensus_dir, "fixes")
        self.github = GitHubIntegration()
        os.makedirs(self.fixes_dir, exist_ok=True)
        
        # Search sources
        self.sources = {
            'stackoverflow': 'https://api.stackexchange.com/2.3',
            'github': 'https://api.github.com',
            'devdocs': 'https://devdocs.io'
        }
    
    def search_stackoverflow(self, query: str, max_results: int = 5) -> List[Dict]:
        """
        Search StackOverflow for solutions
        Returns list of questions with accepted answers
        """
        try:
            # Clean and encode query
            clean_query = query.replace(' ', '%20')
            
            # Build API URL
            url = f"{self.sources['stackoverflow']}/search/advanced?order=desc&sort=votes&q={clean_query}&accepted=True&site=stackoverflow"
            
            # Fetch results using curl
            cmd = ['curl', '-s', url, '--compressed']
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            
            questions = []
            for item in data.get('items', [])[:max_results]:
                question = {
                    'title': item.get('title', 'No title'),
                    'link': item.get('link', ''),
                    'score': item.get('score', 0),
                    'answer_count': item.get('answer_count', 0),
                    'is_answered': item.get('is_answered', False),
                    'tags': item.get('tags', []),
                    'question_id': item.get('question_id', 0)
                }
                questions.append(question)
            
            return questions
        except Exception as e:
            print(f"StackOverflow search error: {e}")
            return []
    
    def get_stackoverflow_answers(self, question_id: int) -> List[Dict]:
        """Get answers for a specific StackOverflow question"""
        try:
            url = f"{self.sources['stackoverflow']}/questions/{question_id}/answers?order=desc&sort=votes&site=stackoverflow&filter=withbody"
            
            cmd = ['curl', '-s', url, '--compressed']
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            
            answers = []
            for item in data.get('items', []):
                answer = {
                    'answer_id': item.get('answer_id', 0),
                    'score': item.get('score', 0),
                    'is_accepted': item.get('is_accepted', False),
                    'body': item.get('body', ''),
                    'creation_date': item.get('creation_date', 0)
                }
                answers.append(answer)
            
            return answers
        except Exception as e:
            print(f"Error fetching answers: {e}")
            return []
    
    def extract_code_from_answer(self, answer_body: str) -> List[str]:
        """Extract code blocks from StackOverflow answer HTML"""
        # Simple extraction - look for <code> tags
        code_blocks = re.findall(r'<code>(.*?)</code>', answer_body, re.DOTALL)
        
        # Also look for <pre> tags
        pre_blocks = re.findall(r'<pre>(.*?)</pre>', answer_body, re.DOTALL)
        
        return code_blocks + pre_blocks
    
    def search_github_issues(self, error_message: str, language: str = None) -> List[Dict]:
        """
        Search GitHub issues for similar errors and fixes
        """
        return self.github.find_similar_fixes(error_message, language)
    
    def search_all_sources(self, query: str, context: Dict = None) -> Dict[str, List[Dict]]:
        """
        Search all available sources for information
        context: optional dict with 'language', 'error_type', etc.
        """
        results = {
            'stackoverflow': [],
            'github': [],
            'combined_score': 0
        }
        
        # Search StackOverflow
        so_results = self.search_stackoverflow(query)
        results['stackoverflow'] = so_results
        
        # Search GitHub
        language = context.get('language') if context else None
        gh_results = self.search_github_issues(query, language)
        results['github'] = gh_results
        
        # Calculate combined relevance score
        results['combined_score'] = len(so_results) * 10 + len(gh_results) * 5
        
        return results
    
    def discover_fix(self, error_message: str, context: Dict = None) -> Optional[Dict]:
        """
        Discover a fix for an error by searching all sources
        Returns best fix found with metadata
        """
        # Search all sources
        results = self.search_all_sources(error_message, context)
        
        best_fix = None
        best_score = 0
        
        # Evaluate StackOverflow results
        for so_item in results['stackoverflow']:
            if so_item['is_answered'] and so_item['answer_count'] > 0:
                score = so_item['score'] + (50 if so_item['answer_count'] > 1 else 0)
                
                if score > best_score:
                    # Fetch the actual answers
                    answers = self.get_stackoverflow_answers(so_item['question_id'])
                    
                    if answers:
                        # Prefer accepted answer
                        accepted = next((a for a in answers if a['is_accepted']), answers[0])
                        
                        code_blocks = self.extract_code_from_answer(accepted['body'])
                        
                        best_fix = {
                            'source': 'stackoverflow',
                            'title': so_item['title'],
                            'link': so_item['link'],
                            'score': score,
                            'code_blocks': code_blocks,
                            'answer_score': accepted['score'],
                            'tags': so_item['tags']
                        }
                        best_score = score
        
        # Evaluate GitHub results
        for gh_item in results['github']:
            score = gh_item.get('stars', 0) / 100  # Normalize stars to comparable score
            
            if score > best_score:
                best_fix = {
                    'source': 'github',
                    'title': f"{gh_item['full_name']}: {gh_item['description']}",
                    'link': gh_item['url'],
                    'score': score,
                    'language': gh_item.get('language', 'Unknown'),
                    'stars': gh_item.get('stars', 0)
                }
                best_score = score
        
        return best_fix
    
    def save_fix_to_consensus(self, fix: Dict, error_signature: str) -> str:
        """
        Save a discovered fix to local consensus
        Returns filepath of saved fix
        """
        # Create a unique filename based on error signature
        safe_name = re.sub(r'[^\w\s-]', '', error_signature)[:50]
        safe_name = re.sub(r'[-\s]+', '_', safe_name)
        
        filename = f"fix_{safe_name}_{int(datetime.now().timestamp())}.json"
        filepath = os.path.join(self.fixes_dir, filename)
        
        # Add metadata
        fix_data = {
            'error_signature': error_signature,
            'fix': fix,
            'discovered_at': datetime.now().isoformat(),
            'applied_count': 0,
            'success_count': 0,
            'rating': 0
        }
        
        with open(filepath, 'w') as f:
            json.dump(fix_data, f, indent=2)
        
        return filepath
    
    def load_local_fixes(self) -> List[Dict]:
        """Load all locally saved fixes"""
        fixes = []
        
        if not os.path.exists(self.fixes_dir):
            return fixes
        
        for filename in os.listdir(self.fixes_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(self.fixes_dir, filename)
                try:
                    with open(filepath, 'r') as f:
                        fix_data = json.load(f)
                        fixes.append(fix_data)
                except Exception:
                    continue
        
        return fixes
    
    def update_fix_stats(self, fix_filepath: str, success: bool):
        """Update statistics for a fix after application"""
        try:
            with open(fix_filepath, 'r') as f:
                fix_data = json.load(f)
            
            fix_data['applied_count'] += 1
            if success:
                fix_data['success_count'] += 1
            
            # Update rating
            if fix_data['applied_count'] > 0:
                fix_data['rating'] = fix_data['success_count'] / fix_data['applied_count']
            
            with open(fix_filepath, 'w') as f:
                json.dump(fix_data, f, indent=2)
        except Exception as e:
            print(f"Error updating fix stats: {e}")
    
    def search_documentation(self, query: str, language: str = None) -> List[Dict]:
        """
        Search programming language documentation
        Uses DuckDuckGo for documentation searches
        """
        results = []
        
        try:
            # Build search query
            search_query = f"{query}"
            if language:
                search_query = f"{language} {search_query} documentation"
            
            # Use curl to search (DuckDuckGo Instant Answer API)
            url = f"https://api.duckduckgo.com/?q={search_query.replace(' ', '+')}&format=json"
            cmd = ['curl', '-s', url]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            
            # Extract relevant results
            if 'AbstractText' in data and data['AbstractText']:
                results.append({
                    'title': data.get('Heading', 'Documentation'),
                    'text': data['AbstractText'],
                    'url': data.get('AbstractURL', ''),
                    'source': data.get('AbstractSource', 'Unknown')
                })
            
            # Extract related topics
            for topic in data.get('RelatedTopics', [])[:3]:
                if isinstance(topic, dict) and 'Text' in topic:
                    results.append({
                        'title': topic.get('Text', '')[:100],
                        'text': topic.get('Text', ''),
                        'url': topic.get('FirstURL', ''),
                        'source': 'Related Documentation'
                    })
        except Exception as e:
            print(f"Documentation search error: {e}")
        
        return results
    
    def create_advanced_task(self, user_request: str, orchestrator: TaskOrchestrator) -> Task:
        """
        Create an advanced task for deepseek with search subtasks
        """
        task = orchestrator.create_task(
            title="Advanced Code Generation",
            description=user_request,
            priority=TaskPriority.HIGH
        )
        
        # Subtask 1: Analyze and plan
        subtask1 = SubTask(
            title="Analyze requirements",
            description="Deep analysis of user request and planning",
            assigned_to="deepseek"
        )
        subtask1.next_steps = [
            NextStep("Parse and understand requirements", assigned_to="deepseek"),
            NextStep("Identify dependencies and potential issues", assigned_to="deepseek"),
            NextStep("Plan implementation approach", assigned_to="deepseek")
        ]
        task.add_subtask(subtask1)
        
        # Subtask 2: Research and gather information
        subtask2 = SubTask(
            title="Research best practices and solutions",
            description="Search for relevant fixes, patterns, and documentation",
            assigned_to="deepseek",
            depends_on=["Analyze requirements"]
        )
        subtask2.next_steps = [
            NextStep("Search StackOverflow for similar problems", assigned_to="deepseek"),
            NextStep("Search GitHub for reference implementations", assigned_to="deepseek"),
            NextStep("Search documentation for API details", assigned_to="deepseek")
        ]
        task.add_subtask(subtask2)
        
        # Subtask 3: Generate code
        subtask3 = SubTask(
            title="Generate implementation",
            description="Write the actual code solution",
            assigned_to="deepseek",
            depends_on=["Research best practices and solutions"]
        )
        subtask3.next_steps = [
            NextStep("Generate core functionality", assigned_to="deepseek"),
            NextStep("Add error handling and edge cases", assigned_to="deepseek"),
            NextStep("Add documentation and comments", assigned_to="deepseek")
        ]
        task.add_subtask(subtask3)
        
        # Subtask 4: Verify and test
        subtask4 = SubTask(
            title="Verify and test solution",
            description="Ensure code quality and correctness",
            assigned_to="deepseek",
            depends_on=["Generate implementation"]
        )
        subtask4.next_steps = [
            NextStep("Review code for common issues", assigned_to="deepseek"),
            NextStep("Suggest tests to run", assigned_to="deepseek"),
            NextStep("Document usage examples", assigned_to="deepseek")
        ]
        task.add_subtask(subtask4)
        
        return task
