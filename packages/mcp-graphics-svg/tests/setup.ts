import { JSDOM } from 'jsdom';
import { registerWindow } from '@svgdotjs/svg.js';

// Create a JSDOM instance
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');

// Set up global window and document for SVG.js
global.window = dom.window as any;
global.document = dom.window.document as any;
global.HTMLElement = dom.window.HTMLElement;

// Register the window with SVG.js
registerWindow(dom.window as any, dom.window.document);