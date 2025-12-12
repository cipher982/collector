#!/usr/bin/env python
"""Convenience CLI wrapper for database migrations.

This is a thin wrapper around migrations.main() that can be invoked as:
    python migrate.py
    python migrate.py --list
"""

from migrations import main

if __name__ == "__main__":
    main()
