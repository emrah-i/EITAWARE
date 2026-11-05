import { hydrate, render } from 'solid-js/web';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The page root is missing.');
const view = () => <App path={window.location.pathname.replace(/\/$/, '') || '/'} />;
if (root.childElementCount > 0) hydrate(view, root);
else render(view, root);
