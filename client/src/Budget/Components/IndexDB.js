// File: /Users/harrival/Desktop/my-app/client/src/Budget/Components/IndexDB.js

// Function to create an IndexedDB called mazePuzzlePlayer
export function createPlayersIndexDB() {
    const request = indexedDB.open("mazePuzzlePlayer", 1);

    request.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("players")) {
            db.createObjectStore("players", { keyPath: "id", autoIncrement: true });
        }
    };

    request.onsuccess = function () {
        console.log("IndexedDB 'mazePuzzlePlayer' created successfully.");
    };

    request.onerror = function (event) {
        console.error("Error creating IndexedDB:", event.target.error);
    };
}

// Function to add a player object to the mazePuzzlePlayer database
export function addPlayer(player) {
    const request = indexedDB.open("mazePuzzlePlayer", 1);

    request.onsuccess = function (event) {
        const db = event.target.result;
        const transaction = db.transaction("players", "readwrite");
        const store = transaction.objectStore("players");

        console.log("Adding player:", player);
        const addRequest = store.add(player);
        
        transaction.oncomplete = function () {
            console.log("Transaction completed successfully.");
        };
        
        transaction.onerror = function (event) {
            console.error("Transaction error:", event.target.error);
        };

        addRequest.onsuccess = function () {
            console.log("Player added successfully:", player);
        };

        addRequest.onerror = function (event) {
            console.error("Error adding player:", event.target.error);
        };
    };

    request.onerror = function (event) {
        console.error("Error opening IndexedDB:", event.target.error);
    };
}

/**
 * Creates and initializes an IndexedDB database with specified object stores and indexes.
 *
 * @param {string} dbName The name of the database to create.
 * @param {number} dbVersion The version of the database. This must be an integer.
 * @param {Array<object>} storesConfig An array of configuration objects for the object stores.
 * Each object should have:
 * - storeName: {string} The name of the object store.
 * - keyPath: {string} (Optional) The key path for the store.
 * - autoIncrement: {boolean} (Optional) Whether the key should auto-increment.
 * - indexes: {Array<object>} (Optional) An array of index configurations.
 * Each index object should have:
 * - indexName: {string} The name of the index.
 * - keyPath: {string} The key path for the index.
 * - options: {object} (Optional) Index options (e.g., { unique: false }).
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database connection object
 * on success or rejects on error.
 */
export function createIndexedDB(dbName, dbVersion, storesConfig) {
    return new Promise((resolve, reject) => {
      // 1. Request to open a connection to the database.
      const request = window.indexedDB.open(dbName, dbVersion);
  
      // 2. Error handling
      request.onerror = (event) => {
        console.error(`IndexedDB error: ${event.target.errorCode}`);
        reject(`IndexedDB error: ${event.target.errorCode}`);
      };
  
      // 3. Success handling
      request.onsuccess = (event) => {
        console.log(`Successfully opened database "${dbName}" version ${dbVersion}.`);
        const db = event.target.result;
        resolve(db);
      };
  
      // 4. Upgrade/Creation handling
      request.onupgradeneeded = (event) => {
        console.log(`Upgrading database "${dbName}"...`);
        const db = event.target.result;
  
        storesConfig.forEach(storeConfig => {
          if (!db.objectStoreNames.contains(storeConfig.storeName)) {
            console.log(`Creating object store: "${storeConfig.storeName}"`);
            const objectStore = db.createObjectStore(storeConfig.storeName, {
              keyPath: storeConfig.keyPath,
              autoIncrement: storeConfig.autoIncrement || false,
            });
  
            if (storeConfig.indexes) {
              storeConfig.indexes.forEach(indexConfig => {
                console.log(`-- Creating index: "${indexConfig.indexName}" on "${indexConfig.keyPath}"`);
                objectStore.createIndex(indexConfig.indexName, indexConfig.keyPath, indexConfig.options || {});
              });
            }
          }
        });
  
        console.log("Database upgrade complete.");
      };
    });
  }
  
  /**
   * Adds data to a specified object store in the database.
   *
   * @param {IDBDatabase} db The database connection object.
   * @param {string} storeName The name of the object store to add data to.
   * @param {object} data The data object to add.
   * @returns {Promise<void>} A promise that resolves when the data is successfully added
   * or rejects on error.
   */
  export function addData(db, storeName, data) {
      return new Promise((resolve, reject) => {
          // 1. Start a transaction.
          // We need a 'readwrite' transaction to be able to add data.
          const transaction = db.transaction([storeName], 'readwrite');
  
          // 2. Handle transaction errors.
          transaction.onerror = (event) => {
              console.error(`Transaction error: ${event.target.error}`);
              reject(`Transaction error: ${event.target.error}`);
          };
  
          // 3. On transaction complete.
          transaction.oncomplete = () => {
              console.log(`Transaction completed: data added to "${storeName}".`);
              resolve();
          };
  
          // 4. Get the object store.
          const objectStore = transaction.objectStore(storeName);
  
          // 5. Make the request to add the data.
          const request = objectStore.add(data);
  
          // 6. Handle success on the add request.
          request.onsuccess = () => {
              console.log('Add request successful.');
          };
      });
  }
  
  
  // --- Example Usage ---
  
  // Define the structure of our database.
//   const myDBConfig = [
//     {
//       storeName: 'mazePuzzlePlayers',
//       keyPath: 'id',
//       autoIncrement: true,
//       indexes: [
//         { indexName: 'Username', keyPath: 'Username', options: { unique: false } },
//         { indexName: 'Email', keyPath: 'Email', options: { unique: false } },
//         { indexName: 'PhoneNumber', keyPath: 'PhoneNumber', options: { unique: false } },
//       ],
//     },
//     // {
//     //   storeName: 'products',
//     //   keyPath: 'productId',
//     //   indexes: [
//     //     { indexName: 'category', keyPath: 'category', options: { unique: false } },
//     //   ],
//     // },
//   ];
  
//   // Call the function to create the database.
//   createIndexedDB('mazePuzzlePlayerDB', 1, myDBConfig)
    // .then(db => {
    //   console.log('Database is ready to use!', db);
  
    //   // --- Example of adding data ---
    //   const newUser = {
    //       email: 'john1.doe@example.com',
    //       name: 'John Doe',
    //       created: new Date()
    //   };
  
    //   // Use our new function to add the user.
    //   return addData(db, 'users', newUser)
    //     .then(() => {
    //       // Close the connection after we're done.
    //       db.close();
    //     });
    // })
    // .catch(error => {
    //   console.error('An error occurred:', error);
    // });
  