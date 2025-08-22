import React, {type ReactNode } from 'react';

import classes from './Button.module.scss';

interface ButtonProps {
    type?: 'button' | 'submit' | 'reset' | 'delete';
    onClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
}

const Button = ({ type = 'button', onClick, disabled, children }: ButtonProps) => {
    // Swap out styles for if it is a delete button or regular button
    const classAlt = type === 'delete' ? classes.deleteButton : classes.button;

    return (
        <button
            className={classAlt}
            onClick={onClick}
            type={type !== 'delete' ? type : undefined}
            disabled={disabled}>
            <span>{children}</span>
        </button>
    );
}

export default Button;