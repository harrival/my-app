import React, {type ReactNode } from 'react';

import classes from './Button.module.scss';

interface ButtonProps {
    type?: 'button' | 'submit' | 'reset' | 'delete';
    onClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
    inverse?: boolean;
}

const Button = ({ type = 'button', onClick, disabled, children, inverse }: ButtonProps) => {
    // Swap out styles for if it is a delete button or regular button
    let classAlt = type === 'delete' ? classes.deleteButton : classes.button;

    if (inverse) {
        classAlt = `${classAlt} ${classes.inverse}`;
    }

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