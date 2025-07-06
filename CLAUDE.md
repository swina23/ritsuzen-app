# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📋 Common Commands

### Development
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Preview production build
npm run preview
```

### Deployment
- Deployed on Vercel at: https://ritsuzen-app.vercel.app
- Auto-deploys on push to main branch
- Build command: `tsc -b && vite build`

## 🏗️ Architecture Overview

This is a React TypeScript application for managing Japanese archery (kyudo) competitions, specifically 20-shot competitions (5 rounds × 4 shots each).

### Core Data Flow
The application follows a unidirectional data flow pattern:
1. **CompetitionContext** manages global state using useReducer
2. **LocalStorage utilities** handle data persistence and migration
3. **Calculation utilities** compute scores, rankings, and handicaps
4. **Export utilities** generate Excel/CSV files using SheetJS

### State Management Architecture
- **Central State**: `CompetitionContext` with useReducer pattern
- **Actions**: Type-safe actions for all state mutations (CREATE_COMPETITION, ADD_PARTICIPANT, UPDATE_SHOT, etc.)
- **Persistence**: Automatic LocalStorage sync with migration support for schema changes
- **History Management**: Separate storage for competition history with size limits

### Key Data Structures
- **Competition**: Contains participants, records, settings, and status
- **ParticipantRecord**: Tracks rounds, shots, totals, ranks (both raw and handicap-adjusted)
- **Participant**: Has order field for user-controlled sorting
- **Shot/Round**: Granular tracking of individual shot results

### Component Hierarchy
- **App**: Main container with navigation and footer
- **CompetitionSetup**: Competition creation with validation
- **ParticipantSetup**: Participant management with drag-less reordering (up/down buttons)
- **ScoreInput**: Round-based shot entry interface
- **Results**: Rankings display with dual ranking systems
- **DataManager**: Import/export and storage management

## 🎯 Domain-Specific Logic

### Ranking System
- **Tie Handling**: Proper tie-breaking (10中, 10中, 9中 → 1位, 1位, 3位)
- **Dual Rankings**: Raw scores and handicap-adjusted scores
- **Handicap Calculation**: Rank × -2 (初段 = -2, 2段 = -4, etc.)

### Japanese Archery Specifics
- **Rank Display**: "初段" for 1st dan, "N段" for others (max 8段)
- **Round Structure**: 5立 (rounds) × 4射 (shots) = 20射 total
- **UI Terminology**: Uses proper Japanese archery terms

### Data Safety Features
- **Competition Protection**: Prevents accidental new competition creation during active competition
- **Migration Support**: Handles schema changes in stored data
- **Export/Import**: JSON format for data backup and transfer between devices

## 🔧 Key Utilities

### formatters.ts
- `formatRank()`: Handles 初段/N段 conversion

### calculations.ts
- `calculateRankings()`: Implements tie-aware ranking with future tiebreaker support
- Scoring and handicap utilities

### localStorage.ts
- Automatic data persistence with size management
- History storage with 50-competition limit
- Migration support for backward compatibility

### Excel/CSV Export
- **excelExport.ts**: Full Excel generation with Japanese formatting
- **dataExport.ts**: JSON export/import and CSV generation
- Uses SheetJS for Excel manipulation

## 🚨 Important Notes

### TypeScript Strictness
- All unused parameters should be prefixed with `_` (e.g., `_index`)
- Null safety is enforced - use `!` operator only when guaranteed non-null
- Strict mode enabled for all compilation

### Participant Ordering
- Participants have an `order` field for display sequence
- Reordering uses array swap + sequential reassignment pattern
- All displays should sort by `(a.order || 0) - (b.order || 0)`

### Data Migration
- LocalStorage data may lack newer fields (e.g., `order`)
- LOAD_COMPETITION action handles backward compatibility
- Always provide default values for new fields

### Styling Conventions
- Uses CSS classes with BEM-style naming
- Color coding: red for scores (`#f44336`), blue for secondary info
- Responsive design prioritizes tablet use (primary target device)