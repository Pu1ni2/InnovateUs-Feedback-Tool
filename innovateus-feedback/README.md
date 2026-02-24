# InnovateUS Feedback Form

A modern, interactive feedback landing experience with scroll-triggered animations, dual interaction modes, and AI-powered follow-ups.

## Features

- **Scroll-triggered 3D Tab Animation**: A device-frame container that rotates and scales into view as users scroll
- **Dual Interaction Modes**:
  - **Quick Fill Mode**: Inline form for rapid completion
  - **Focus Mode**: Immersive fullscreen form inside the animated tab
- **Interactive Background**: Cream-colored background with subtle dotted pattern and mouse parallax
- **Voice & Text Input**: Support for both typing and voice recording
- **AI Follow-ups**: Smart questions based on user responses
- **Personalized Greeting**: Displays "Hi, {Name}" when user name is provided
- **Responsive Design**: Works seamlessly on desktop and mobile

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **UI Components**: shadcn/ui (stone theme)
- **Animations**: framer-motion
- **Icons**: lucide-react

## Project Structure

```
innovateus-feedback/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Main landing page with hero, scroll animation, dual modes
│   │   ├── layout.tsx        # Root layout with Inter font
│   │   └── globals.css       # Global styles + custom scrollbar
│   ├── components/
│   │   ├── ui/               # shadcn components + container-scroll-animation
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── label.tsx
│   │   │   ├── separator.tsx
│   │   │   └── container-scroll-animation.tsx
│   │   ├── dotted-background.tsx    # Mouse parallax dotted pattern
│   │   └── feedback-form.tsx        # Main feedback form with voice/text
│   └── lib/
│       └── utils.ts          # Utility functions (cn helper)
├── public/                   # Static assets
├── components.json           # shadcn config
├── next.config.js
├── tailwind.config.ts
└── package.json
```

## Installation & Setup

### Prerequisites
- Node.js 18+
- npm

### Commands to Set Up

```bash
# 1. Navigate to the project directory
cd innovateus-feedback

# 2. Install dependencies (already included)
npm install

# 3. Run development server
npm run dev

# 4. Build for production
npm run build

# 5. Start production server
npm start
```

### Dependencies Installed
```bash
# Core animation library
npm install framer-motion

# Icons
npm install lucide-react

# shadcn components (installed via CLI)
npx shadcn add button card input textarea badge label separator
```

## Usage

### Running the App

1. **Development mode**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

2. **With user name**:
   ```
   http://localhost:3000?name=John
   ```
   Or set in localStorage:
   ```js
   localStorage.setItem("innovateus-user-name", "John");
   ```

### Key User Flows

1. **Landing**: User sees cream background with dotted parallax, hero title
2. **Scroll**: 3D tab animates into view with scroll-triggered rotation/scale
3. **Quick Fill**: User can fill form inline below the tab
4. **Enter Focus Mode**: Click "Enter Form" for immersive experience
5. **Form Completion**: Answer 3 questions with AI follow-ups
6. **Submit**: Thank you screen with option to restart

## Component Details

### ContainerScroll (`/components/ui/container-scroll-animation.tsx`)
- **Props**:
  - `titleComponent`: React node for the title above the card
  - `children`: Content to render inside the animated card
- **Behavior**: 
  - Card rotates from 20deg to 0deg as user scrolls
  - Scales from 1.05x to 1x (desktop) or 0.7x to 0.9x (mobile)
  - Title translates upward (-100px) during scroll

### DottedBackground (`/components/dotted-background.tsx`)
- **Behavior**: 
  - Two layers of radial gradient dots
  - Mouse movement causes subtle parallax (20px max drift)
  - Spring animation for smooth, non-jarring movement
  - Warm cream base with gradient overlay

### FeedbackForm (`/components/feedback-form.tsx`)
- **Props**:
  - `userName`: Optional string for personalization
  - `mode`: 'inline' | 'focused' - controls UI layout
  - `onEnterFocus`: Callback when user enters focus mode
  - `onExitFocus`: Callback when user exits focus mode
- **Features**:
  - 3 guided questions (What did you try? What happened? What got in the way?)
  - Text input with auto-resize
  - Voice input toggle with animation
  - AI follow-up indicator
  - Progress bar
  - State preservation between modes

## Design System

### Colors
- **Background**: `#FDF8F3` (warm cream)
- **Card Surface**: `#FFFBF5` (light cream)
- **Primary**: Amber (`#d97706`) for actions
- **Text**: Stone palette (`#0c0a09`, `#44403c`, `#a8a29e`)
- **Borders**: Stone-200/300 for subtle definition

### Typography
- **Font**: Inter (Google Fonts)
- **Headings**: Semibold, tight tracking
- **Body**: Regular, comfortable line-height

### Spacing
- Generous padding for breathing room
- Responsive scaling for mobile/desktop
- Consistent 4px/8px grid

## Accessibility

- Keyboard navigation for all interactive elements
- Focus states on buttons and inputs
- ARIA labels on icon-only buttons
- High contrast text (WCAG AA compliant)
- Reduced motion support (via framer-motion)

## Responsive Breakpoints

- **Mobile** (< 768px): Tab scales to 0.7-0.9x, form stacks vertically
- **Desktop** (≥ 768px): Tab at full size (1.05-1x), side-by-side layouts

## Implementation Answers

### What data/props will be passed?
- `userName` (optional): For personalized greeting
- `mode`: Controls inline vs focused UI
- `onEnterFocus`/`onExitFocus`: Mode toggle callbacks

### State management requirements?
- Form data persisted in component state (preserved when switching modes)
- Current question index
- Voice recording state
- AI processing state
- User name loaded from localStorage/query params

### Required assets?
- None (CSS-generated dotted pattern)
- Icons from lucide-react

### Expected responsive behavior?
- Smooth scaling of 3D card
- Form remains usable at all sizes
- Focus overlay covers full viewport on all devices

### Best place to use this component?
- Main landing page (`/app/page.tsx`)
- Can be adapted for `/feedback` or `/check-in` routes
- Suitable for government training feedback collection

## License

MIT License - InnovateUS Project
