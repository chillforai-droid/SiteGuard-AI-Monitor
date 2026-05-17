import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.resolve(__dirname, './client/index.html'),
    path.resolve(__dirname, './client/src/**/*.{js,ts,jsx,tsx}')
  ],
  theme: {
    extend: {}
  },
  plugins: []
}
