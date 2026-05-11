# mercy-legal-web Structure

```text
mercy-legal-web/
├── components.json
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
└── src/
    ├── app/
    │   ├── (marketing)/
    │   │   └── page.tsx
    │   ├── dashboard/
    │   │   ├── layout.tsx
    │   │   ├── loading.tsx
    │   │   └── page.tsx
    │   ├── globals.css
    │   └── layout.tsx
    ├── components/
    │   ├── dashboard/
    │   │   ├── activity-feed.tsx
    │   │   ├── ai-assistant-panel.tsx
    │   │   ├── clause-library.tsx
    │   │   ├── contract-analyzer.tsx
    │   │   ├── document-vault.tsx
    │   │   ├── matter-management.tsx
    │   │   ├── sidebar.tsx
    │   │   └── upload-dropzone.tsx
    │   ├── marketing/
    │   │   ├── animated-shell.tsx
    │   │   ├── cta-section.tsx
    │   │   ├── feature-showcase.tsx
    │   │   ├── hero-section.tsx
    │   │   ├── pricing-section.tsx
    │   │   └── testimonials.tsx
    │   └── ui/
    │       ├── badge.tsx
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── input.tsx
    │       ├── progress.tsx
    │       ├── separator.tsx
    │       ├── tabs.tsx
    │       ├── textarea.tsx
    │       └── tooltip.tsx
    ├── lib/
    │   ├── data.ts
    │   └── utils.ts
    └── store/
        └── app-store.ts
```

## Key Configuration

- `package.json`: Next.js 15 App Router, React 19, Tailwind CSS 4, shadcn-style Radix primitives, Lucide, Framer Motion, and Zustand.
- `next.config.ts`: strict React mode and typed routes.
- `components.json`: shadcn/ui source layout with `new-york` style and Lucide icons.
- `src/app/globals.css`: Mercy.ai design tokens, Tailwind theme, animations, and global base styles.
