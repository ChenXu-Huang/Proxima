import { render } from 'preact';
import { I18nProvider, createBrowserI18n } from '../../lib/i18n';
import '../../styles/tokens.css';
import '../../styles/app.css';
import { App } from './App';

const i18n = createBrowserI18n();
document.documentElement.lang = i18n.locale;

const root = document.getElementById('app');
if (root) {
  render(
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>,
    root,
  );
}
