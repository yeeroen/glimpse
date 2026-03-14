import { defineConfig } from 'vite-plus';
import { nitro } from 'nitro/vite';

export default defineConfig({
    staged: {
        '*': 'vp check --fix',
    },

    lint: {
        options: {
            typeAware: true,
            typeCheck: true,
        },
        rules: {},
    },

    fmt: {
        singleQuote: true,
        tabWidth: 4,
    },

    plugins: [
        nitro({
            serverDir: './src/server',
        }),
    ],
});
