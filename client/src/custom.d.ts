/// <reference types="react-scripts" />

declare module '*.css';
declare module '*.module.scss' {
    const classes: { readonly [key: string]: string };
    export default classes;
}
declare module 'react-resizable';

declare module '*.jpeg' {
    const content: string;
    export default content;
}
declare module '*.jpg' {
    const content: string;
    export default content;
}
declare module '*.png' {
    const content: string;
    export default content;
}
declare module '*.svg' {
    const content: string;
    export default content;
}
declare module '*.webp' {
    const content: string;
    export default content;
}
declare module '*.gif' {
    const content: string;
    export default content;
}