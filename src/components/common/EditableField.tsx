/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EditableText, EditableTextProps } from './EditableText';

export interface EditableFieldProps extends EditableTextProps {
  fieldLabel: string;
  labelClassName?: string;
  valueClassName?: string;
  layout?: 'horizontal' | 'vertical';
}

export const EditableField: React.FC<EditableFieldProps> = ({
  fieldLabel,
  labelClassName = 'text-slate-400 text-xs',
  valueClassName = 'text-white text-xs font-semibold',
  layout = 'horizontal',
  className = '',
  ...editableProps
}) => {
  return (
    <div
      className={
        layout === 'horizontal'
          ? 'flex items-center justify-between gap-2 text-xs py-1'
          : 'space-y-0.5 text-xs py-1'
      }
    >
      <span className={labelClassName}>{fieldLabel}</span>
      <EditableText
        {...editableProps}
        label={editableProps.label || fieldLabel}
        className={`${valueClassName} ${className}`}
      />
    </div>
  );
};
