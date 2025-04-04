const express = require('express');
const router = new express.Router();

const CUSTOMERTABLE = [
  {ID: 1000, FirstName: 'Uche', LastName: 'Nwosu', Email: 'uchenwosu@gmail.com', PhoneNumber: '1111111111', Address: '123 street city state, usa 12345', PermissionGroup: 'Rep', IsAdmin: false},
  {ID: 1001, FirstName: 'Obinna', LastName: 'Agu', Email: 'obinnaagu@gmail.com', PhoneNumber: '1111111112', Address: '456 street city state, usa 12345', PermissionGroup: 'Rep', IsAdmin: false},
  {ID: 1002, FirstName: 'Onyi', LastName: 'Okeke', Email: 'onyiokeke@gmail.com', PhoneNumber: '1111111113', Address: '789 street city state, usa 12345', PermissionGroup: 'Rep', IsAdmin: false},
]

const EventTable = [
  {ID: 1, EventType: 'Peoria Fair', EventLocation: 'Peoria Illinios', EventFirstDate: '06/30/2025', EventLastDate: '07/07/2025'},
  {ID: 2, EventType: 'Illinios State Fair', EventLocation: 'Spring Illinios', EventFirstDate: '07/09/2025', EventLastDate: '07/16/2025'},
  {ID: 3, EventType: 'Indiana State Fair', EventLocation: 'Indianapolis Indiana', EventFirstDate: '18/07/2025', EventLastDate: '25/07/2025'},
]

const REPTABLE = [
  {ID: 10, CusterID: 1000, EventID: 1, IsActive: true },
]
const PLAYERS = [
  { ID: 1, Username: "harri", Email: 'harri@gmail.com', PhoneNo: '', PuzzleType: 'cat', TimeUsed: '', TimeCreated: '', RepID: '', EventID: '', EventDate: '' },
  { ID: 2, Username: "val", Email: 'val@gmail.com', PhoneNo: '', PuzzleType: 'dog', TimeUsed: '', TimeCreated: '', RepID: '', EventID: '', EventDate: '' },
]

router.get('/', (req, res) => {
  res.json({ player: PLAYERS })
})

router.get('/:id', (req, res) => {
  const player = PLAYERS.find(u => u.ID === +req.params.id)
  res.json({ player })
})

router.post('/add', (req, res) => {
  console.log(req)
})

module.exports = router;