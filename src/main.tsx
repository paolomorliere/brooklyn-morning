import { render } from 'preact';
import '@/styles/global.css';
import '@/styles/home.css';
import '@/styles/todo.css';
import '@/styles/groceries.css';
import { App } from './App';

render(<App />, document.getElementById('app')!);
