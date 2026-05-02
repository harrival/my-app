import React, { useState } from "react";
import { type Customer } from "../../user/pages/UserInterface";
import axios from "axios";

const CreateProfile = () => {
    // Removed unused customer state
    interface ExtendedCustomer extends Customer {
        email?: string;
        phoneNumber?: string;
    }

    const [customerInfo, setCustomerInfo] = useState<ExtendedCustomer>({
        id: "",
        customerguid: "",
        permissiongroup: "",
        isadmin: false,
        firstname: "",
        lastname: "",
        contact: "",
        address: ""
    });
    const [errors, setErrors] = useState({
        fName: "",
        lName: "",
        contact: "",
        address: "",
    });

    const uniqueGUID = 'CUSTOMERGUID' + Date.now().toString();

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCustomerInfo((prevState) => ({ ...prevState, [name]: value }));
        setErrors((prevState) => ({ ...prevState, [name]: "" }));
    };

    const validateField = (field: string, value: string): string => {
            if (!value) {
                return `${field} is required`;
            }
            return "";
        };

    const validateContact = async (value: string, dbSearch: string): Promise<string> => {
    if (!value) return '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10}$/;
    if (!emailRegex.test(value) && !phoneRegex.test(value)) {
      return 'Please enter a valid phone number or email';
    }
    const uniqueContactError = await validateUniqueContact(value, dbSearch);
    if (uniqueContactError) {
      return uniqueContactError;
    }
    return '';
  };

  const validateUniqueContact = async (value: string, dbSearch: string): Promise<string> => {
    let returnValue = '';
    const dbObject = {
        tableName: "customerstable",
        fields: {[dbSearch]: value}
    }
    try {
      const response = await axios.get(`http://localhost:5001/dbsearch/`, { params: dbObject });
      if (response.data.length > 0) {
        returnValue = 'Contact already exists';
      }
    } catch (error) {
      console.error('Error checking contact:', error);
    }
    return returnValue;
  };

    const handleSubmit = async (e: React.FormEvent): Promise<void> => {
        e.preventDefault();
        e.preventDefault();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^\d{10}$/;
        let contactIsEmail = false;
        let contactIsPhone = false;
        let dbSearch = '';

        if (emailRegex.test(customerInfo.contact)) {
            contactIsEmail = true;
            dbSearch = 'email';
        } else if (phoneRegex.test(customerInfo.contact)) {
            contactIsPhone = true;
            dbSearch = 'phone_number';
        }

        const fNameError = validateField("First Name", customerInfo.firstname);
        const lNameError = validateField("Last Name", customerInfo.lastname);
        const contactError = await validateContact(customerInfo.contact, dbSearch);
        const addressError = validateField("Address", customerInfo.address);

        setErrors({
            fName: fNameError,
            lName: lNameError,
            contact: contactError,
            address: addressError,
        });

        if (!fNameError && !lNameError && !contactError && !addressError) {
            const newProfile = {
                ...customerInfo,
                customerguid: uniqueGUID,
            };

            if (contactIsEmail) {
                newProfile.email = customerInfo.contact;
            } else if (contactIsPhone) {
                newProfile.phoneNumber = customerInfo.contact;
            }
            const { id, contact, ...newProfileData } = newProfile;
            const dbObject = {
                tableName: "customerstable",
                fields: newProfileData
            }

            try {
                const response = await axios.post('http://localhost:5001/addToTable', dbObject);

                if (response.status === 201) {
                    setCustomerInfo({
                        id: "",
                        customerguid: "",
                        permissiongroup: "",
                        isadmin: false,
                        firstname: "",
                        lastname: "",
                        contact: "",
                        address: ""
                    });
                    setErrors({
                        fName: "",
                        lName: "",
                        contact: "",
                        address: "",
                    });
                    window.history.pushState({}, "", "/dashboard");
                    const navigateEvent = new PopStateEvent("popstate");
                    window.dispatchEvent(navigateEvent);
                }
            } catch (error) {
                console.error("Error creating profile:", error);
            }
        }
    };

    return (
        <form
            onSubmit={(e) => {
                handleSubmit(e);
            }}
        >
            <div className="input-group">
                <label htmlFor="fName">First Name</label>
                <input
                    id="fName"
                    name="firstname"
                    type="text"
                    placeholder="Enter your first name"
                    value={customerInfo.firstname}
                    onChange={handleInputChange}
                />
                {errors.fName && <p>{errors.fName}</p>}
            </div>
            <div className="input-group">
                <label htmlFor="lName">Last Name</label>
                <input
                    id="lName"
                    name="lastname"
                    type="text"
                    placeholder="Enter your last name"
                    value={customerInfo.lastname}
                    onChange={handleInputChange}
                />
                {errors.lName && <p>{errors.lName}</p>}
            </div>
            <div className="input-group">
                <label htmlFor="contact">Contact</label>
                <input
                    id="contact"
                    name="contact"
                    type="text"
                    placeholder="Enter phone or email"
                    value={customerInfo.contact}
                    onChange={handleInputChange}
                />
                {errors.contact && <p>{errors.contact}</p>}
            </div>
            <div className="input-group">
                <label htmlFor="address">Address</label>
                <input
                    id="address"
                    name="address"
                    type="text"
                    placeholder="Enter address"
                    value={customerInfo.address}
                    onChange={handleInputChange}
                />
                {errors.address && <p>{errors.address}</p>}
            </div>
            <button type="submit">Create Profile</button>
        </form>
    );
};

export default CreateProfile;
