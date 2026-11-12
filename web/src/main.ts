import './style.css';
import { PrototypeInterface } from './client/components/PrototypeInterface';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Point de montage #app introuvable.');

new PrototypeInterface(root);
