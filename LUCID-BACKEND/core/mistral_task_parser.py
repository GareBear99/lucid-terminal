"""
Mistral Task Parser
Parses user requests into tasks/subtasks for template-based operations
Handles: file downloads, template searches, GitHub cloning, simple scripts
"""

import re
from typing import Dict, List, Optional
from task_orchestrator import Task, SubTask, NextStep, TaskPriority, TaskOrchestrator

class MistralTaskParser:
    """Parses user requests for mistral-based task execution"""
    
    def __init__(self, orchestrator: TaskOrchestrator):
        self.orchestrator = orchestrator
        
        # Keywords for different task types
        self.download_keywords = ['download', 'get', 'fetch', 'retrieve', 'grab']
        self.search_keywords = ['search', 'find', 'look up', 'lookup', 'query']
        self.create_keywords = ['create', 'make', 'build', 'generate']
        self.github_keywords = ['github', 'repo', 'repository', 'clone']
        self.file_keywords = ['file', 'directory', 'folder', 'path']
    
    def parse_request(self, user_request: str) -> Task:
        """Parse a user request into a structured task"""
        request_lower = user_request.lower()
        
        # Detect request type
        if self._is_download_request(request_lower):
            return self._parse_download_request(user_request)
        elif self._is_github_request(request_lower):
            return self._parse_github_request(user_request)
        elif self._is_search_request(request_lower):
            return self._parse_search_request(user_request)
        elif self._is_script_request(request_lower):
            return self._parse_script_request(user_request)
        else:
            return self._parse_generic_request(user_request)
    
    def _is_download_request(self, request: str) -> bool:
        """Check if request involves downloading"""
        return any(kw in request for kw in self.download_keywords)
    
    def _is_github_request(self, request: str) -> bool:
        """Check if request involves GitHub"""
        return any(kw in request for kw in self.github_keywords)
    
    def _is_search_request(self, request: str) -> bool:
        """Check if request involves searching"""
        return any(kw in request for kw in self.search_keywords)
    
    def _is_script_request(self, request: str) -> bool:
        """Check if request involves script generation"""
        script_indicators = ['script', 'program', 'code', 'automate']
        return any(kw in request for kw in script_indicators)
    
    def _parse_download_request(self, request: str) -> Task:
        """
        Parse download request
        Example: "download a picture of a raccoon to a directory named raccoons on desktop"
        """
        task = self.orchestrator.create_task(
            title="Download Request",
            description=request,
            priority=TaskPriority.MEDIUM
        )
        
        # Subtask 1: Determine what to download
        subtask1 = SubTask(
            title="Identify download target",
            description="Determine what needs to be downloaded and from where",
            assigned_to="mistral"
        )
        subtask1.next_steps = [
            NextStep("Parse request for download target", assigned_to="mistral"),
            NextStep("Identify appropriate source (web search if needed)", assigned_to="mistral")
        ]
        task.add_subtask(subtask1)
        
        # Subtask 2: Prepare destination
        subtask2 = SubTask(
            title="Prepare destination directory",
            description="Create or verify target directory exists",
            assigned_to="mistral",
            depends_on=["Identify download target"]
        )
        subtask2.next_steps = [
            NextStep("Parse destination path from request", assigned_to="mistral"),
            NextStep("Create directory if it doesn't exist", assigned_to="mistral")
        ]
        task.add_subtask(subtask2)
        
        # Subtask 3: Execute download
        subtask3 = SubTask(
            title="Download file",
            description="Perform the actual download operation",
            assigned_to="mistral",
            depends_on=["Prepare destination directory"]
        )
        subtask3.next_steps = [
            NextStep("Generate download script/command", assigned_to="mistral"),
            NextStep("Execute download", assigned_to="mistral"),
            NextStep("Verify download success", assigned_to="mistral")
        ]
        task.add_subtask(subtask3)
        
        return task
    
    def _parse_github_request(self, request: str) -> Task:
        """
        Parse GitHub-related request
        Example: "clone the tensorflow repository from github"
        """
        task = self.orchestrator.create_task(
            title="GitHub Operation",
            description=request,
            priority=TaskPriority.MEDIUM
        )
        
        # Subtask 1: Identify repository
        subtask1 = SubTask(
            title="Identify GitHub repository",
            description="Find the correct repository and URL",
            assigned_to="mistral"
        )
        subtask1.next_steps = [
            NextStep("Parse repository name from request", assigned_to="mistral"),
            NextStep("Search GitHub for repository", assigned_to="mistral"),
            NextStep("Verify repository exists", assigned_to="mistral")
        ]
        task.add_subtask(subtask1)
        
        # Subtask 2: Prepare local environment
        subtask2 = SubTask(
            title="Prepare local destination",
            description="Set up local directory for clone",
            assigned_to="mistral",
            depends_on=["Identify GitHub repository"]
        )
        subtask2.next_steps = [
            NextStep("Determine clone destination", assigned_to="mistral"),
            NextStep("Verify git is installed", assigned_to="mistral")
        ]
        task.add_subtask(subtask2)
        
        # Subtask 3: Clone repository
        subtask3 = SubTask(
            title="Clone repository",
            description="Execute git clone command",
            assigned_to="mistral",
            depends_on=["Prepare local destination"]
        )
        subtask3.next_steps = [
            NextStep("Generate git clone command", assigned_to="mistral"),
            NextStep("Execute clone", assigned_to="mistral"),
            NextStep("Verify clone success", assigned_to="mistral")
        ]
        task.add_subtask(subtask3)
        
        return task
    
    def _parse_search_request(self, request: str) -> Task:
        """
        Parse search request
        Example: "search for python logging best practices"
        """
        task = self.orchestrator.create_task(
            title="Web Search Request",
            description=request,
            priority=TaskPriority.MEDIUM
        )
        
        # Subtask 1: Formulate search query
        subtask1 = SubTask(
            title="Formulate search query",
            description="Extract and optimize search terms",
            assigned_to="mistral"
        )
        subtask1.next_steps = [
            NextStep("Extract key terms from request", assigned_to="mistral"),
            NextStep("Optimize query for search engines", assigned_to="mistral")
        ]
        task.add_subtask(subtask1)
        
        # Subtask 2: Perform web search
        subtask2 = SubTask(
            title="Execute web search",
            description="Search the web for relevant information",
            assigned_to="mistral",
            depends_on=["Formulate search query"]
        )
        subtask2.next_steps = [
            NextStep("Check WiFi connectivity", assigned_to="mistral"),
            NextStep("Perform web search", assigned_to="mistral"),
            NextStep("Parse and rank results", assigned_to="mistral")
        ]
        task.add_subtask(subtask2)
        
        # Subtask 3: Present results
        subtask3 = SubTask(
            title="Present search results",
            description="Format and display findings",
            assigned_to="mistral",
            depends_on=["Execute web search"]
        )
        subtask3.next_steps = [
            NextStep("Format results for display", assigned_to="mistral"),
            NextStep("Present to user", assigned_to="mistral")
        ]
        task.add_subtask(subtask3)
        
        return task
    
    def _parse_script_request(self, request: str) -> Task:
        """
        Parse script generation request
        Example: "create a python script to backup my files"
        """
        task = self.orchestrator.create_task(
            title="Script Generation Request",
            description=request,
            priority=TaskPriority.MEDIUM
        )
        
        # Subtask 1: Analyze requirements
        subtask1 = SubTask(
            title="Analyze script requirements",
            description="Understand what the script needs to do",
            assigned_to="mistral"
        )
        subtask1.next_steps = [
            NextStep("Extract script purpose from request", assigned_to="mistral"),
            NextStep("Identify required functionality", assigned_to="mistral"),
            NextStep("Determine target language", assigned_to="mistral")
        ]
        task.add_subtask(subtask1)
        
        # Subtask 2: Find matching template
        subtask2 = SubTask(
            title="Find appropriate template",
            description="Search for matching script template",
            assigned_to="mistral",
            depends_on=["Analyze script requirements"]
        )
        subtask2.next_steps = [
            NextStep("Search built-in templates", assigned_to="mistral"),
            NextStep("Search consensus templates", assigned_to="mistral"),
            NextStep("Search online templates if WiFi available", assigned_to="mistral")
        ]
        task.add_subtask(subtask2)
        
        # Subtask 3: Generate script
        subtask3 = SubTask(
            title="Generate final script",
            description="Create the script from template",
            assigned_to="mistral",
            depends_on=["Find appropriate template"]
        )
        subtask3.next_steps = [
            NextStep("Customize template for request", assigned_to="mistral"),
            NextStep("Add error handling", assigned_to="mistral"),
            NextStep("Format and present script", assigned_to="mistral")
        ]
        task.add_subtask(subtask3)
        
        return task
    
    def _parse_generic_request(self, request: str) -> Task:
        """Parse a generic request that doesn't fit other categories"""
        task = self.orchestrator.create_task(
            title="General Request",
            description=request,
            priority=TaskPriority.MEDIUM
        )
        
        # Single subtask for generic handling
        subtask = SubTask(
            title="Process request",
            description="Handle the user's request using available templates",
            assigned_to="mistral"
        )
        subtask.next_steps = [
            NextStep("Analyze request intent", assigned_to="mistral"),
            NextStep("Select appropriate approach", assigned_to="mistral"),
            NextStep("Execute and respond", assigned_to="mistral")
        ]
        task.add_subtask(subtask)
        
        return task
