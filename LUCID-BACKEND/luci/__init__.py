#!/usr/bin/env python3
"""
🩸 Luci Package Manager
LuciferAI's intelligent package management system (like conda)
"""
from .smart_installer import SmartInstaller, install_package

__version__ = "1.0.0"
__all__ = ['SmartInstaller', 'install_package']
