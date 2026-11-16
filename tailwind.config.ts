import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import animate from 'tailwindcss-animate';

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
          // The components below were written against these names, which the
          // palette never defined: about 110 uses (a Save button's background,
          // focus rings, status colours) compiled to no CSS at all. They map
          // onto the existing brand colours rather than adding new ones.
          green: '#1B5E20',
          greenDark: '#2EA043',
          blue: '#2563EB',
          teal: '#0F766E',
          tealDark: '#2DD4BF',
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
      // Tailwind 4 spellings used throughout src/, which Tailwind 3 does not
      // know: without these the classes were silently dropped.
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
      backdropBlur: {
        xs: '2px',
      },
      scale: {
        98: '0.98',
      },
    },
  },
  plugins: [
    // `animate-in fade-in zoom-in-95` on menus and dialogs comes from this
    // plugin; it was installed but never enabled.
    animate,
    plugin(({ addUtilities }) => {
      addUtilities({
        '.outline-hidden': { outline: '2px solid transparent', 'outline-offset': '2px' },
      });
    }),
  ],
};

export default config;
