import './style.css';
import { ChatInterface } from './client/components/ChatInterface';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Point de montage #app introuvable.');

new ChatInterface(root);
