/**
 * cn(): join CSS class names, skipping falsy ones.
 *   cn('btn', isActive && 'btn-active', { 'opacity-50': disabled })
 */
import clsx from 'clsx';

export const cn = clsx;
