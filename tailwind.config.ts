import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'SF Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Scholarly Atelier Brand Tokens
        scholarly: {
          DEFAULT: '#1B5E20',
          hover: '#164E1B',
          dark: '#2EA043',
          darkHover: '#278638',
          subtle: '#E8F5E9',
          darkSubtle: '#1B3522',
        },
        citation: {
          DEFAULT: '#2563EB',
          dark: '#38BDF8',
          subtle: '#EFF6FF',
          darkSubtle: '#1E293B',
        },
        diagnostic: {
          DEFAULT: '#D97706',
          dark: '#F59E0B',
          subtle: '#FEF3C7',
          darkSubtle: '#451A03',
        },
        crimson: {
          DEFAULT: '#DC2626',
          dark: '#EF4444',
          subtle: '#FEE2E2',
          darkSubtle: '#450A0A',
        },
        // Physical Paper & Slate Surface Hierarchy
        surface: {
          light: '#FBFBFA',
          lightPanel: '#FFFFFF',
          lightSubtle: '#F4F3EF',
          lightBorder: '#E7E5DF',
          dark: '#141416',
          darkPanel: '#1C1C1F',
          darkSubtle: '#26262B',
          darkBorder: '#2E2E35',
        },
        // Backwards compatibility mappings mapped to warm scholarly tones
        brand: {
          indigo: '#1C1917',
          ocean: '#2563EB',
          cyan: '#2EA043',
          mint: '#1B5E20',
        },
      },
    },
  },
  plugins: [],
};

export default config;
