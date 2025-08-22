import React, { type ReactNode  } from 'react';
import classes from './Card.module.scss';

interface CardProps {
    children: ReactNode;
    onClick?: () => void
}

const Card= (props: CardProps) => {
    return (
        <div className={classes.card} onClick={props.onClick}>
            {props.children}
        </div>
    );
}

export default Card;