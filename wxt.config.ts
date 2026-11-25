import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['proxy'],
    action: {
      default_title: '__MSG_actionTitle__',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'proxima@chenxu.dev',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          } as never,
        }
      : {
          minimum_chrome_version: '120',
        }),
  }),
});
