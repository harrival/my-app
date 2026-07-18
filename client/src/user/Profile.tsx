import React, { useState } from 'react';
// import { Customer } from './UserInterface';
import CreateProfile from '../UI/Form/CreateProfileForm';
import Card from '../UI/Card/Card';

const ProfilePage = () => {
    const [hasProfile, setHasProfile] = useState(false); // State to determine if the user has a profile

    return (
        <>
            <Card>
                {hasProfile &&
                    (<div>
                        <h2>Welcome back!</h2>
                        <p>Your profile details go here.</p>
                    </div>)}
                    
                    {!hasProfile &&(<div>
                        <h2>Create Your Profile</h2>
                        <CreateProfile />
                    </div>)}
            </Card>
        </>
    );
}

export default ProfilePage;