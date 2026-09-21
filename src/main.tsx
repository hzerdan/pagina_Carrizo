import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Polyfill para compatibilidad móvil (WebView WhatsApp, Safari iOS < 17.4, Android WebView)
/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Blindaje contra extensiones y traductores de navegador (Google Translate, DeepL, etc.)
// Evita el crash 'NotFoundError: Failed to execute removeChild/insertBefore on Node' cuando modifican el DOM fuera de React
if (typeof window !== 'undefined' && typeof Node !== 'undefined' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn('Ignorado removeChild defensivo: el nodo no pertenece al padre esperado (posible modificación externa del DOM).', child);
      return child;
    }
    try {
      return originalRemoveChild.call(this, child) as T;
    } catch (error: any) {
      if (error?.name === 'NotFoundError' || error?.code === 8) {
        console.warn('Capturado NotFoundError en removeChild por traducción de navegador.', child);
        return child;
      }
      throw error;
    }
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn('Ignorado insertBefore defensivo: referenceNode no pertenece al padre (posible traducción de navegador).', referenceNode);
      return this.appendChild(newNode) as T;
    }
    try {
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    } catch (error: any) {
      if (error?.name === 'NotFoundError' || error?.code === 8) {
        console.warn('Capturado NotFoundError en insertBefore por traducción de navegador.', newNode);
        return this.appendChild(newNode) as T;
      }
      throw error;
    }
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
