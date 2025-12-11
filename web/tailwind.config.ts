import type { Config } from 'tailwindcss';

export default {
    content: ['./src/**/*.{html,js,svelte,ts}'],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#facc15',
                    dark: '#fbbf24',
                    light: '#fef3c7'
                },
                surface: {
                    base: '#050505',
                    elevated: 'rgba(255, 255, 255, 0.03)',
                    card: 'rgba(255, 255, 255, 0.02)'
                },
                text: {
                    primary: '#f5f5f5',
                    secondary: 'rgba(255, 255, 255, 0.8)',
                    muted: 'rgba(255, 255, 255, 0.5)',
                    dim: 'rgba(255, 255, 255, 0.3)'
                },
                border: {
                    DEFAULT: 'rgba(255, 255, 255, 0.08)',
                    hover: 'rgba(250, 204, 21, 0.3)',
                    accent: 'rgba(250, 204, 21, 0.5)'
                }
            },
            fontFamily: {
                display: ['Syne', 'sans-serif'],
                body: ['DM Sans', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace']
            },
            spacing: {
                xs: '0.25rem',
                sm: '0.5rem',
                md: '1rem',
                lg: '1.5rem',
                xl: '2rem',
                '2xl': '3rem',
                '3xl': '4rem',
                '4xl': '6rem'
            },
            borderRadius: {
                sm: '4px',
                md: '8px',
                lg: '12px',
                xl: '16px',
                '2xl': '20px',
                full: '9999px'
            }
        }
    },
    plugins: []
} satisfies Config;
