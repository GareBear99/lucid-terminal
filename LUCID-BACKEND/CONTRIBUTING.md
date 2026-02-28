# Contributing to LuciferAI

Thank you for your interest in contributing to LuciferAI! 🩸

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/LuciferAI_Local.git`
3. Install dependencies: `pip install -r requirements.txt`
4. Run setup: `./install.sh`

## Development Guidelines

### Code Style
- Follow PEP 8 for Python code
- Use meaningful variable and function names
- Add docstrings to all public functions
- Keep functions focused and modular

### Testing
- Test your changes before submitting
- Run syntax checks: `python -m py_compile your_file.py`
- Test with multiple model tiers if applicable

### Commit Messages
- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, Remove)
- Reference issues when applicable

## Areas for Contribution

### High Priority
- **Parser Improvements**: Enhance NLP in `core/nlp_parser.py`
- **Platform Support**: Linux/Windows testing and fixes
- **Documentation**: Improve guides and add examples

### Model Support
- Add new model definitions in `core/model_files_map.py`
- Test new GGUF models for compatibility
- Document model performance characteristics

### Core Features
- FixNet consensus improvements
- New command implementations
- Performance optimizations

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test thoroughly
4. Update documentation if needed
5. Submit a pull request with clear description

## Code of Conduct

- Be respectful and constructive
- Help others learn and grow
- Focus on the code, not the person

## Questions?

Open an issue for questions or discussions.

---

**Made with 🩸 by the LuciferAI community**
