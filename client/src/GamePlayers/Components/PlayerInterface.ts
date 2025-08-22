interface Player {
    id: string;
    playerguid: string;
    username: string;
    puzzletype: 'CAT' | 'DOG';
    gamestatus: 'Created' | string;
    highlight?: boolean;
    email: string;
    phonenumber: string;
    timeused: string;
    timeupdated: string | null;
    repid: string;
    eventid: string;
    timecreated: string;
}

export {
    type Player
}