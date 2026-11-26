// lab_map.js — the classroom's fixed layout and the permanently solid MDC North Campus building,
// lake, water fountain, swimming pool, and sidewalk geometry, shared by the browser (LiDAR
// raycasting, physical polygon collision resolution, local A* sidewalk routing) and the server.
// Coordinates are meters on the x/z floor plane.

export const LAB_BOUNDS = Object.freeze({ minX: -2.8, maxX: 2.8, minZ: -1.8, maxZ: 1.8 });

export const CLASSROOM_OBSTACLES = Object.freeze([
  {
    id: 'classroom-benches',
    name: 'Electronics & Soldering Benches',
    minX: -2.2, maxX: -0.4,
    minZ: -0.6, maxZ: 0.35,
    height: 0.85,
    color: 0xef4444,
    userCreated: false
  },
  {
    id: 'classroom-printers',
    name: '3D Printers & Component Testing Rig',
    minX: 0.4, maxX: 2.1,
    minZ: -0.5, maxZ: 0.45,
    height: 0.9,
    color: 0xf59e0b,
    userCreated: false
  },
  {
    id: 'classroom-partition',
    name: 'Glass Partition Divider',
    minX: -1.2, maxX: 1.2,
    minZ: 0.95, maxZ: 1.25,
    height: 1.1,
    color: 0x8b5cf6,
    userCreated: false
  }
].map(Object.freeze));

// Permanently solid building, lake, water fountain, pool polygons & sidewalk network for mdc_north_campus.glb
export const CAMPUS_OBSTACLES = Object.freeze(
[
  {
    "id": "campus-lake",
    "name": "Central Reflection Lake",
    "minX": -2.05,
    "maxX": 1.55,
    "minZ": -0.8,
    "maxZ": 0.8,
    "height": 0.35,
    "color": 165063,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -2.05,
        -0.8
      ],
      [
        1.55,
        -0.8
      ],
      [
        1.55,
        0.8
      ],
      [
        -2.05,
        0.8
      ]
    ]
  },
  {
    "id": "campus-fountain",
    "name": "Central Lake Water Fountain",
    "minX": -0.47,
    "maxX": -0.03,
    "minZ": -0.22,
    "maxZ": 0.22,
    "height": 0.55,
    "color": 3718648,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -0.03,
        0.0
      ],
      [
        -0.059,
        0.11
      ],
      [
        -0.14,
        0.191
      ],
      [
        -0.25,
        0.22
      ],
      [
        -0.36,
        0.191
      ],
      [
        -0.441,
        0.11
      ],
      [
        -0.47,
        0.0
      ],
      [
        -0.441,
        -0.11
      ],
      [
        -0.36,
        -0.191
      ],
      [
        -0.25,
        -0.22
      ],
      [
        -0.14,
        -0.191
      ],
      [
        -0.059,
        -0.11
      ]
    ]
  },
  {
    "id": "campus-bldg-1000",
    "name": "Bldg 1000: North Academic & EdFed",
    "minX": -2.0,
    "maxX": 1.5,
    "minZ": -3.1,
    "maxZ": -1.85,
    "height": 1.05,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -2.0,
        -3.1
      ],
      [
        1.5,
        -3.1
      ],
      [
        1.5,
        -1.85
      ],
      [
        -2.0,
        -1.85
      ]
    ]
  },
  {
    "id": "campus-rotunda",
    "name": "Octagon Rotunda Lecture Hall",
    "minX": 1.54,
    "maxX": 2.3,
    "minZ": -2.8,
    "maxZ": -2.04,
    "height": 1.08,
    "color": 6514417,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        2.3,
        -2.42
      ],
      [
        2.189,
        -2.151
      ],
      [
        1.92,
        -2.04
      ],
      [
        1.651,
        -2.151
      ],
      [
        1.54,
        -2.42
      ],
      [
        1.651,
        -2.689
      ],
      [
        1.92,
        -2.8
      ],
      [
        2.189,
        -2.689
      ]
    ]
  },
  {
    "id": "campus-bldg-2000",
    "name": "Bldg 2000: Paul R. Scott Library",
    "minX": 2.9,
    "maxX": 4.7,
    "minZ": -0.95,
    "maxZ": 0.85,
    "height": 1.2,
    "color": 9133302,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        2.9,
        -0.95
      ],
      [
        4.7,
        -0.95
      ],
      [
        4.7,
        0.85
      ],
      [
        2.9,
        0.85
      ]
    ]
  },
  {
    "id": "campus-bldg-3000",
    "name": "Bldg 3000: Academic & Busway Wing",
    "minX": 2.9,
    "maxX": 4.6,
    "minZ": -3.2,
    "maxZ": -1.75,
    "height": 1.05,
    "color": 6514417,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        2.9,
        -3.2
      ],
      [
        4.6,
        -3.2
      ],
      [
        4.6,
        -1.75
      ],
      [
        2.9,
        -1.75
      ]
    ]
  },
  {
    "id": "campus-bldg-4000",
    "name": "Bldg 4000: Main Admin & Student Life",
    "minX": -0.5,
    "maxX": 2.1,
    "minZ": 1.9,
    "maxZ": 3.35,
    "height": 1.15,
    "color": 1096065,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -0.5,
        1.9
      ],
      [
        2.1,
        1.9
      ],
      [
        2.1,
        3.35
      ],
      [
        -0.5,
        3.35
      ]
    ]
  },
  {
    "id": "campus-lehman",
    "name": "Lehman Theater & Pawer Center",
    "minX": -2.3,
    "maxX": -0.95,
    "minZ": 1.85,
    "maxZ": 3.25,
    "height": 1.1,
    "color": 16096779,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -2.3,
        1.85
      ],
      [
        -0.95,
        1.85
      ],
      [
        -0.95,
        3.25
      ],
      [
        -2.3,
        3.25
      ]
    ]
  },
  {
    "id": "campus-science",
    "name": "Science Complex (West Lab Wing)",
    "minX": -5.6,
    "maxX": -4.3,
    "minZ": -1.1,
    "maxZ": 2.1,
    "height": 1.25,
    "color": 15485081,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -5.6,
        -1.1
      ],
      [
        -4.3,
        -1.1
      ],
      [
        -4.3,
        2.1
      ],
      [
        -5.6,
        2.1
      ]
    ]
  },
  {
    "id": "campus-criminal-justice",
    "name": "Criminal Justice & Fire Science",
    "minX": -5.5,
    "maxX": -4.2,
    "minZ": -3.4,
    "maxZ": -2.0,
    "height": 1.0,
    "color": 15680580,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -5.5,
        -3.4
      ],
      [
        -4.2,
        -3.4
      ],
      [
        -4.2,
        -2.0
      ],
      [
        -5.5,
        -2.0
      ]
    ]
  },
  {
    "id": "campus-aquatic-fitness",
    "name": "KIPP & Aquatic Fitness Center",
    "minX": -1.8,
    "maxX": 1.4,
    "minZ": -6.2,
    "maxZ": -4.7,
    "height": 0.98,
    "color": 1357990,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -1.8,
        -6.2
      ],
      [
        1.4,
        -6.2
      ],
      [
        1.4,
        -4.7
      ],
      [
        -1.8,
        -4.7
      ]
    ]
  },
  {
    "id": "campus-aquatic-pool",
    "name": "Aquatic Center Outdoor Pool",
    "minX": 1.5,
    "maxX": 3.3,
    "minZ": -6.1,
    "maxZ": -4.6,
    "height": 0.3,
    "color": 440020,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        1.5,
        -6.1
      ],
      [
        3.3,
        -6.1
      ],
      [
        3.3,
        -4.6
      ],
      [
        1.5,
        -4.6
      ]
    ]
  },
  {
    "id": "campus-walkways",
    "name": "Campus Sidewalk & Crosswalk Network",
    "minX": -11.8,
    "maxX": 11.8,
    "minZ": -10.8,
    "maxZ": 10.8,
    "height": 0.02,
    "color": 9741240,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "isWalkwayNetwork": true,
    "boxes": [
      [
        -2.55,
        2.65,
        -1.72,
        1.72
      ]
    ],
    "polylines": [
      [
        [
          -2.2,
          -1.25
        ],
        [
          2.25,
          -1.25
        ],
        [
          2.25,
          1.25
        ],
        [
          -2.2,
          1.25
        ],
        [
          -2.2,
          -1.25
        ]
      ],
      [
        [
          -2.6,
          -1.65
        ],
        [
          2.55,
          -1.65
        ],
        [
          2.55,
          1.65
        ],
        [
          -2.6,
          1.65
        ],
        [
          -2.6,
          -1.65
        ]
      ],
      [
        [
          -2.6,
          -8.5
        ],
        [
          -2.6,
          8.5
        ]
      ],
      [
        [
          -3.45,
          -8.5
        ],
        [
          -3.45,
          8.5
        ]
      ],
      [
        [
          -3.55,
          -3.15
        ],
        [
          -2.2,
          -3.15
        ]
      ],
      [
        [
          -3.55,
          -1.3
        ],
        [
          -2.15,
          -1.25
        ]
      ],
      [
        [
          -3.55,
          0.35
        ],
        [
          -2.15,
          0.35
        ]
      ],
      [
        [
          -3.55,
          1.35
        ],
        [
          -2.15,
          1.25
        ]
      ],
      [
        [
          -3.55,
          -3.15
        ],
        [
          -3.55,
          2.4
        ],
        [
          -4.95,
          2.4
        ]
      ],
      [
        [
          -2.6,
          -1.65
        ],
        [
          -2.6,
          -3.6
        ],
        [
          2.0,
          -3.6
        ],
        [
          2.0,
          -6.2
        ],
        [
          3.5,
          -6.2
        ]
      ],
      [
        [
          2.25,
          -1.25
        ],
        [
          2.25,
          -2.5
        ],
        [
          3.05,
          -2.5
        ],
        [
          3.05,
          -4.65
        ],
        [
          2.0,
          -4.65
        ]
      ],
      [
        [
          2.25,
          -1.25
        ],
        [
          4.65,
          -1.25
        ],
        [
          4.65,
          1.25
        ],
        [
          2.25,
          1.25
        ]
      ],
      [
        [
          4.65,
          -1.5
        ],
        [
          6.0,
          -1.5
        ]
      ],
      [
        [
          4.65,
          1.5
        ],
        [
          6.0,
          1.5
        ]
      ],
      [
        [
          5.25,
          -8.5
        ],
        [
          5.25,
          8.5
        ]
      ],
      [
        [
          0.15,
          1.25
        ],
        [
          0.15,
          3.6
        ]
      ],
      [
        [
          -2.6,
          3.55
        ],
        [
          3.25,
          3.55
        ]
      ]
    ]
  }
].map(Object.freeze));

// Permanently solid building, lake, water fountain, pool polygons & sidewalk network extracted
// directly from the 3D meshes of mdc_north_campus_osm.glb
export const CAMPUS_OSM_OBSTACLES = Object.freeze(
[
  {
    "id": "osm-lake",
    "name": "Central Reflection Lake",
    "minX": -1.9,
    "maxX": 1.4,
    "minZ": -0.68,
    "maxZ": 0.68,
    "height": 0.35,
    "color": 165063,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -1.9,
        -0.68
      ],
      [
        1.4,
        -0.68
      ],
      [
        1.4,
        0.68
      ],
      [
        -1.9,
        0.68
      ]
    ]
  },
  {
    "id": "osm-fountain",
    "name": "Central Lake Water Fountain",
    "minX": -0.47,
    "maxX": -0.03,
    "minZ": -0.22,
    "maxZ": 0.22,
    "height": 0.55,
    "color": 3718648,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -0.03,
        0.0
      ],
      [
        -0.059,
        0.11
      ],
      [
        -0.14,
        0.191
      ],
      [
        -0.25,
        0.22
      ],
      [
        -0.36,
        0.191
      ],
      [
        -0.441,
        0.11
      ],
      [
        -0.47,
        0.0
      ],
      [
        -0.441,
        -0.11
      ],
      [
        -0.36,
        -0.191
      ],
      [
        -0.25,
        -0.22
      ],
      [
        -0.14,
        -0.191
      ],
      [
        -0.059,
        -0.11
      ]
    ]
  },
  {
    "id": "osm-pool-west",
    "name": "Aquatic Center Dive Pool",
    "minX": 1.97,
    "maxX": 2.42,
    "minZ": -6.97,
    "maxZ": -6.42,
    "height": 0.3,
    "color": 440020,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        1.97,
        -6.97
      ],
      [
        2.42,
        -6.97
      ],
      [
        2.42,
        -6.42
      ],
      [
        1.97,
        -6.42
      ]
    ]
  },
  {
    "id": "osm-pool-main",
    "name": "Aquatic Center Olympic Pool",
    "minX": 2.4,
    "maxX": 3.32,
    "minZ": -7.04,
    "maxZ": -6.37,
    "height": 0.3,
    "color": 440020,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        2.4,
        -7.04
      ],
      [
        3.32,
        -7.04
      ],
      [
        3.32,
        -6.37
      ],
      [
        2.4,
        -6.37
      ]
    ]
  },
  {
    "id": "osm-bldg-1",
    "name": "Campus Building #1",
    "minX": 2.75,
    "maxX": 4.5,
    "minZ": -1.03,
    "maxZ": 0.81,
    "height": 1.12,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        4.44,
        -1.03
      ],
      [
        2.75,
        -0.98
      ],
      [
        2.81,
        0.81
      ],
      [
        4.5,
        0.75
      ]
    ]
  },
  {
    "id": "osm-bldg-2",
    "name": "Campus Building #2",
    "minX": 4.09,
    "maxX": 5.01,
    "minZ": 0.18,
    "maxZ": 0.4,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        5.01,
        0.18
      ],
      [
        4.09,
        0.21
      ],
      [
        4.1,
        0.4
      ],
      [
        5.01,
        0.37
      ]
    ]
  },
  {
    "id": "osm-bldg-3",
    "name": "Campus Building #3",
    "minX": 6.03,
    "maxX": 6.41,
    "minZ": -9.96,
    "maxZ": -9.47,
    "height": 0.89,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        6.39,
        -9.96
      ],
      [
        6.03,
        -9.95
      ],
      [
        6.05,
        -9.47
      ],
      [
        6.41,
        -9.48
      ]
    ]
  },
  {
    "id": "osm-bldg-4",
    "name": "Campus Building #4",
    "minX": -3.87,
    "maxX": -3.59,
    "minZ": 6.11,
    "maxZ": 6.32,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -3.59,
        6.11
      ],
      [
        -3.87,
        6.12
      ],
      [
        -3.86,
        6.32
      ],
      [
        -3.59,
        6.31
      ]
    ]
  },
  {
    "id": "osm-bldg-5",
    "name": "Campus Building #5",
    "minX": -8.37,
    "maxX": -8.1,
    "minZ": -8.81,
    "maxZ": -8.53,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -8.1,
        -8.81
      ],
      [
        -8.37,
        -8.8
      ],
      [
        -8.36,
        -8.53
      ],
      [
        -8.1,
        -8.54
      ]
    ]
  },
  {
    "id": "osm-bldg-6",
    "name": "Campus Building #6",
    "minX": -0.87,
    "maxX": 1.74,
    "minZ": -8.88,
    "maxZ": -7.24,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        1.46,
        -8.52
      ],
      [
        1.47,
        -8.6
      ],
      [
        -0.4,
        -8.88
      ],
      [
        -0.42,
        -8.78
      ],
      [
        -0.65,
        -8.83
      ],
      [
        -0.87,
        -7.61
      ],
      [
        1.52,
        -7.24
      ],
      [
        1.74,
        -8.47
      ]
    ]
  },
  {
    "id": "osm-bldg-7",
    "name": "Campus Building #7",
    "minX": -8.62,
    "maxX": -8.01,
    "minZ": -5.62,
    "maxZ": -5.33,
    "height": 0.95,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -8.02,
        -5.62
      ],
      [
        -8.62,
        -5.6
      ],
      [
        -8.61,
        -5.33
      ],
      [
        -8.01,
        -5.34
      ]
    ]
  },
  {
    "id": "osm-bldg-8",
    "name": "Campus Building #8",
    "minX": 0.51,
    "maxX": 3.0,
    "minZ": 1.78,
    "maxZ": 3.34,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        2.95,
        1.78
      ],
      [
        0.51,
        1.86
      ],
      [
        0.56,
        3.34
      ],
      [
        3.0,
        3.27
      ]
    ]
  },
  {
    "id": "osm-bldg-9",
    "name": "Campus Building #9",
    "minX": -8.66,
    "maxX": -7.96,
    "minZ": -10.76,
    "maxZ": -10.02,
    "height": 0.84,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -7.98,
        -10.76
      ],
      [
        -8.21,
        -10.75
      ],
      [
        -8.21,
        -10.73
      ],
      [
        -8.57,
        -10.72
      ],
      [
        -8.57,
        -10.74
      ],
      [
        -8.66,
        -10.74
      ],
      [
        -8.65,
        -10.25
      ],
      [
        -8.2,
        -10.26
      ],
      [
        -8.19,
        -10.02
      ],
      [
        -8.11,
        -10.02
      ],
      [
        -8.11,
        -10.04
      ],
      [
        -7.96,
        -10.05
      ]
    ]
  },
  {
    "id": "osm-bldg-10",
    "name": "Campus Building #10",
    "minX": -1.66,
    "maxX": 2.11,
    "minZ": -2.52,
    "maxZ": -1.78,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        2.05,
        -2.52
      ],
      [
        1.95,
        -2.52
      ],
      [
        1.96,
        -2.0
      ],
      [
        0.64,
        -1.96
      ],
      [
        0.64,
        -2.13
      ],
      [
        0.56,
        -2.12
      ],
      [
        0.55,
        -2.19
      ],
      [
        0.48,
        -2.19
      ],
      [
        0.48,
        -2.13
      ],
      [
        0.43,
        -2.12
      ],
      [
        0.44,
        -1.96
      ],
      [
        -1.5,
        -1.89
      ],
      [
        -1.52,
        -2.44
      ],
      [
        -1.63,
        -2.45
      ],
      [
        -1.61,
        -1.89
      ],
      [
        -1.66,
        -1.89
      ],
      [
        -1.66,
        -1.78
      ],
      [
        2.11,
        -1.91
      ],
      [
        2.11,
        -2.01
      ],
      [
        2.08,
        -2.01
      ]
    ]
  },
  {
    "id": "osm-bldg-11",
    "name": "Campus Building #11",
    "minX": -4.92,
    "maxX": -3.68,
    "minZ": -3.05,
    "maxZ": -1.64,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -3.71,
        -3.05
      ],
      [
        -4.03,
        -3.04
      ],
      [
        -4.02,
        -2.89
      ],
      [
        -4.08,
        -2.89
      ],
      [
        -4.08,
        -2.73
      ],
      [
        -4.01,
        -2.73
      ],
      [
        -3.99,
        -2.0
      ],
      [
        -4.92,
        -1.97
      ],
      [
        -4.91,
        -1.64
      ],
      [
        -3.97,
        -1.66
      ],
      [
        -3.98,
        -1.74
      ],
      [
        -3.88,
        -1.74
      ],
      [
        -3.88,
        -1.65
      ],
      [
        -3.68,
        -1.65
      ]
    ]
  },
  {
    "id": "osm-bldg-12",
    "name": "Campus Building #12",
    "minX": 4.12,
    "maxX": 4.25,
    "minZ": 0.48,
    "maxZ": 0.66,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        4.12,
        0.48
      ],
      [
        4.12,
        0.66
      ],
      [
        4.24,
        0.66
      ],
      [
        4.25,
        0.48
      ]
    ]
  },
  {
    "id": "osm-bldg-13",
    "name": "Campus Building #13",
    "minX": 6.12,
    "maxX": 6.46,
    "minZ": -0.66,
    "maxZ": -0.34,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        6.45,
        -0.66
      ],
      [
        6.12,
        -0.65
      ],
      [
        6.12,
        -0.34
      ],
      [
        6.46,
        -0.35
      ]
    ]
  },
  {
    "id": "osm-bldg-14",
    "name": "Campus Building #14",
    "minX": -7.84,
    "maxX": -7.63,
    "minZ": 6.55,
    "maxZ": 7.11,
    "height": 1.16,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -7.65,
        6.55
      ],
      [
        -7.84,
        6.55
      ],
      [
        -7.82,
        7.11
      ],
      [
        -7.63,
        7.11
      ]
    ]
  },
  {
    "id": "osm-bldg-15",
    "name": "Campus Building #15",
    "minX": -8.07,
    "maxX": -7.91,
    "minZ": 8.39,
    "maxZ": 8.59,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -7.92,
        8.39
      ],
      [
        -8.03,
        8.39
      ],
      [
        -8.03,
        8.46
      ],
      [
        -8.07,
        8.47
      ],
      [
        -8.07,
        8.54
      ],
      [
        -8.02,
        8.53
      ],
      [
        -8.02,
        8.59
      ],
      [
        -7.91,
        8.59
      ]
    ]
  },
  {
    "id": "osm-bldg-16",
    "name": "Campus Building #16",
    "minX": 4.58,
    "maxX": 4.72,
    "minZ": 0.41,
    "maxZ": 0.6,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        4.71,
        0.41
      ],
      [
        4.58,
        0.41
      ],
      [
        4.59,
        0.6
      ],
      [
        4.72,
        0.6
      ]
    ]
  },
  {
    "id": "osm-bldg-17",
    "name": "Campus Building #17",
    "minX": -5.7,
    "maxX": -5.48,
    "minZ": -4.44,
    "maxZ": -4.19,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -5.66,
        -4.44
      ],
      [
        -5.7,
        -4.4
      ],
      [
        -5.52,
        -4.19
      ],
      [
        -5.48,
        -4.23
      ]
    ]
  },
  {
    "id": "osm-bldg-18",
    "name": "Campus Building #18",
    "minX": 4.33,
    "maxX": 4.46,
    "minZ": 0.47,
    "maxZ": 0.66,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        4.46,
        0.47
      ],
      [
        4.33,
        0.47
      ],
      [
        4.34,
        0.66
      ],
      [
        4.46,
        0.66
      ]
    ]
  },
  {
    "id": "osm-bldg-19",
    "name": "Campus Building #19",
    "minX": 2.03,
    "maxX": 2.94,
    "minZ": -3.6,
    "maxZ": -2.43,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        2.7,
        -2.7
      ],
      [
        2.94,
        -2.97
      ],
      [
        2.93,
        -3.35
      ],
      [
        2.66,
        -3.6
      ],
      [
        2.29,
        -3.59
      ],
      [
        2.03,
        -3.33
      ],
      [
        2.04,
        -2.94
      ],
      [
        2.31,
        -2.69
      ],
      [
        2.45,
        -2.7
      ],
      [
        2.47,
        -2.43
      ],
      [
        2.57,
        -2.44
      ],
      [
        2.56,
        -2.7
      ]
    ]
  },
  {
    "id": "osm-bldg-20",
    "name": "Campus Building #20",
    "minX": -5.68,
    "maxX": -5.42,
    "minZ": -5.12,
    "maxZ": -4.87,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -5.47,
        -5.12
      ],
      [
        -5.68,
        -4.92
      ],
      [
        -5.63,
        -4.87
      ],
      [
        -5.42,
        -5.07
      ]
    ]
  },
  {
    "id": "osm-bldg-21",
    "name": "Campus Building #21",
    "minX": -2.61,
    "maxX": -0.14,
    "minZ": -3.35,
    "maxZ": -1.78,
    "height": 0.98,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -0.71,
        -3.35
      ],
      [
        -1.5,
        -3.33
      ],
      [
        -1.49,
        -2.96
      ],
      [
        -1.37,
        -2.96
      ],
      [
        -1.37,
        -2.89
      ],
      [
        -1.72,
        -2.88
      ],
      [
        -1.73,
        -3.07
      ],
      [
        -2.12,
        -3.06
      ],
      [
        -2.12,
        -3.01
      ],
      [
        -2.61,
        -3.0
      ],
      [
        -2.61,
        -2.83
      ],
      [
        -2.49,
        -2.84
      ],
      [
        -2.49,
        -2.73
      ],
      [
        -2.56,
        -2.73
      ],
      [
        -2.55,
        -2.3
      ],
      [
        -2.46,
        -2.3
      ],
      [
        -2.45,
        -2.21
      ],
      [
        -2.58,
        -2.19
      ],
      [
        -2.58,
        -2.03
      ],
      [
        -2.08,
        -2.05
      ],
      [
        -2.08,
        -2.0
      ],
      [
        -1.67,
        -2.02
      ],
      [
        -1.67,
        -2.13
      ],
      [
        -1.47,
        -2.13
      ],
      [
        -1.46,
        -1.78
      ],
      [
        -0.65,
        -1.81
      ],
      [
        -0.67,
        -2.17
      ],
      [
        -0.79,
        -2.17
      ],
      [
        -0.81,
        -2.51
      ],
      [
        -0.66,
        -2.52
      ],
      [
        -0.66,
        -2.65
      ],
      [
        -0.8,
        -2.65
      ],
      [
        -0.81,
        -2.99
      ],
      [
        -0.42,
        -3.0
      ],
      [
        -0.41,
        -2.85
      ],
      [
        -0.14,
        -2.86
      ],
      [
        -0.15,
        -3.32
      ],
      [
        -0.44,
        -3.31
      ],
      [
        -0.43,
        -3.1
      ],
      [
        -0.69,
        -3.08
      ]
    ]
  },
  {
    "id": "osm-bldg-22",
    "name": "Campus Building #22",
    "minX": -4.39,
    "maxX": -4.09,
    "minZ": -9.75,
    "maxZ": -9.41,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -4.22,
        -9.51
      ],
      [
        -4.09,
        -9.52
      ],
      [
        -4.1,
        -9.75
      ],
      [
        -4.25,
        -9.75
      ],
      [
        -4.24,
        -9.64
      ],
      [
        -4.39,
        -9.63
      ],
      [
        -4.38,
        -9.41
      ],
      [
        -4.22,
        -9.41
      ]
    ]
  },
  {
    "id": "osm-bldg-23",
    "name": "Campus Building #23",
    "minX": 0.79,
    "maxX": 0.97,
    "minZ": 3.03,
    "maxZ": 3.12,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        0.96,
        3.03
      ],
      [
        0.79,
        3.04
      ],
      [
        0.8,
        3.12
      ],
      [
        0.97,
        3.11
      ]
    ]
  },
  {
    "id": "osm-bldg-24",
    "name": "Campus Building #24",
    "minX": 5.8,
    "maxX": 6.17,
    "minZ": -9.2,
    "maxZ": -7.67,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        6.1,
        -9.2
      ],
      [
        5.8,
        -9.19
      ],
      [
        5.85,
        -7.67
      ],
      [
        6.15,
        -7.68
      ],
      [
        6.14,
        -8.1
      ],
      [
        6.17,
        -8.1
      ],
      [
        6.14,
        -8.96
      ],
      [
        6.11,
        -8.96
      ]
    ]
  },
  {
    "id": "osm-bldg-25",
    "name": "Campus Building #25",
    "minX": -6.89,
    "maxX": -6.8,
    "minZ": 4.55,
    "maxZ": 4.86,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -6.8,
        4.55
      ],
      [
        -6.89,
        4.55
      ],
      [
        -6.89,
        4.86
      ],
      [
        -6.81,
        4.86
      ]
    ]
  },
  {
    "id": "osm-bldg-26",
    "name": "Campus Building #26",
    "minX": -7.46,
    "maxX": -7.07,
    "minZ": -10.41,
    "maxZ": -9.99,
    "height": 1.2,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -7.2,
        -10.41
      ],
      [
        -7.46,
        -10.11
      ],
      [
        -7.32,
        -9.99
      ],
      [
        -7.07,
        -10.29
      ]
    ]
  },
  {
    "id": "osm-bldg-27",
    "name": "Campus Building #27",
    "minX": 4.32,
    "maxX": 4.71,
    "minZ": -0.73,
    "maxZ": -0.46,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        4.71,
        -0.46
      ],
      [
        4.71,
        -0.73
      ],
      [
        4.55,
        -0.73
      ],
      [
        4.56,
        -0.62
      ],
      [
        4.32,
        -0.61
      ],
      [
        4.32,
        -0.46
      ]
    ]
  },
  {
    "id": "osm-bldg-28",
    "name": "Campus Building #28",
    "minX": 2.9,
    "maxX": 3.39,
    "minZ": -10.32,
    "maxZ": -9.76,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        3.37,
        -10.32
      ],
      [
        2.9,
        -10.3
      ],
      [
        2.92,
        -9.76
      ],
      [
        3.39,
        -9.78
      ]
    ]
  },
  {
    "id": "osm-bldg-29",
    "name": "Campus Building #29",
    "minX": 7.17,
    "maxX": 8.21,
    "minZ": -9.66,
    "maxZ": -7.77,
    "height": 0.66,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        7.83,
        -9.26
      ],
      [
        8.11,
        -9.27
      ],
      [
        8.1,
        -9.66
      ],
      [
        7.47,
        -9.62
      ],
      [
        7.5,
        -8.88
      ],
      [
        7.33,
        -8.88
      ],
      [
        7.34,
        -8.78
      ],
      [
        7.17,
        -8.77
      ],
      [
        7.2,
        -7.96
      ],
      [
        7.35,
        -7.96
      ],
      [
        7.36,
        -7.77
      ],
      [
        7.62,
        -7.78
      ],
      [
        7.61,
        -7.96
      ],
      [
        7.48,
        -7.96
      ],
      [
        7.48,
        -8.03
      ],
      [
        8.21,
        -8.06
      ],
      [
        8.18,
        -8.79
      ],
      [
        7.85,
        -8.78
      ]
    ]
  },
  {
    "id": "osm-bldg-30",
    "name": "Campus Building #30",
    "minX": -7.33,
    "maxX": -7.23,
    "minZ": 6.94,
    "maxZ": 7.25,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -7.24,
        6.94
      ],
      [
        -7.33,
        6.94
      ],
      [
        -7.32,
        7.25
      ],
      [
        -7.23,
        7.25
      ]
    ]
  },
  {
    "id": "osm-bldg-31",
    "name": "Campus Building #31",
    "minX": 3.67,
    "maxX": 5.08,
    "minZ": -7.52,
    "maxZ": -6.25,
    "height": 0.64,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        4.47,
        -7.49
      ],
      [
        4.42,
        -7.51
      ],
      [
        4.37,
        -7.52
      ],
      [
        4.32,
        -7.51
      ],
      [
        4.27,
        -7.49
      ],
      [
        4.24,
        -7.45
      ],
      [
        3.67,
        -7.43
      ],
      [
        3.68,
        -7.12
      ],
      [
        4.17,
        -7.13
      ],
      [
        4.2,
        -6.25
      ],
      [
        4.61,
        -6.27
      ],
      [
        4.58,
        -7.15
      ],
      [
        5.08,
        -7.16
      ],
      [
        5.07,
        -7.48
      ],
      [
        4.49,
        -7.46
      ]
    ]
  },
  {
    "id": "osm-bldg-32",
    "name": "Campus Building #32",
    "minX": 4.81,
    "maxX": 5.1,
    "minZ": -6.63,
    "maxZ": -6.4,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        5.09,
        -6.62
      ],
      [
        4.97,
        -6.63
      ],
      [
        4.87,
        -6.61
      ],
      [
        4.81,
        -6.62
      ],
      [
        4.82,
        -6.4
      ],
      [
        5.1,
        -6.41
      ]
    ]
  },
  {
    "id": "osm-bldg-33",
    "name": "Campus Building #33",
    "minX": -3.6,
    "maxX": -3.45,
    "minZ": 1.72,
    "maxZ": 1.9,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -3.46,
        1.72
      ],
      [
        -3.6,
        1.72
      ],
      [
        -3.59,
        1.9
      ],
      [
        -3.45,
        1.89
      ]
    ]
  },
  {
    "id": "osm-bldg-34",
    "name": "Campus Building #34",
    "minX": 6.26,
    "maxX": 6.33,
    "minZ": -7.89,
    "maxZ": -7.73,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        6.32,
        -7.89
      ],
      [
        6.26,
        -7.89
      ],
      [
        6.26,
        -7.73
      ],
      [
        6.33,
        -7.73
      ]
    ]
  },
  {
    "id": "osm-bldg-35",
    "name": "Campus Building #35",
    "minX": -5.71,
    "maxX": -5.41,
    "minZ": 3.09,
    "maxZ": 3.38,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -5.51,
        3.38
      ],
      [
        -5.48,
        3.37
      ],
      [
        -5.42,
        3.31
      ],
      [
        -5.41,
        3.28
      ],
      [
        -5.41,
        3.2
      ],
      [
        -5.42,
        3.17
      ],
      [
        -5.48,
        3.11
      ],
      [
        -5.53,
        3.09
      ],
      [
        -5.58,
        3.09
      ],
      [
        -5.66,
        3.13
      ],
      [
        -5.68,
        3.15
      ],
      [
        -5.69,
        3.17
      ],
      [
        -5.71,
        3.23
      ],
      [
        -5.71,
        3.25
      ],
      [
        -5.69,
        3.31
      ],
      [
        -5.63,
        3.37
      ],
      [
        -5.61,
        3.38
      ]
    ]
  },
  {
    "id": "osm-bldg-36",
    "name": "Campus Building #36",
    "minX": -5.28,
    "maxX": -4.97,
    "minZ": 3.08,
    "maxZ": 3.38,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -5.1,
        3.38
      ],
      [
        -5.07,
        3.37
      ],
      [
        -5.05,
        3.36
      ],
      [
        -5.02,
        3.35
      ],
      [
        -5.0,
        3.33
      ],
      [
        -4.99,
        3.3
      ],
      [
        -4.97,
        3.28
      ],
      [
        -4.97,
        3.19
      ],
      [
        -4.98,
        3.17
      ],
      [
        -4.99,
        3.14
      ],
      [
        -5.03,
        3.1
      ],
      [
        -5.08,
        3.08
      ],
      [
        -5.16,
        3.08
      ],
      [
        -5.21,
        3.1
      ],
      [
        -5.25,
        3.14
      ],
      [
        -5.28,
        3.22
      ],
      [
        -5.27,
        3.25
      ],
      [
        -5.27,
        3.27
      ],
      [
        -5.26,
        3.3
      ],
      [
        -5.24,
        3.33
      ],
      [
        -5.22,
        3.35
      ],
      [
        -5.14,
        3.38
      ]
    ]
  },
  {
    "id": "osm-bldg-37",
    "name": "Campus Building #37",
    "minX": -4.75,
    "maxX": -3.98,
    "minZ": -0.5,
    "maxZ": 2.26,
    "height": 1.39,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -4.38,
        -0.5
      ],
      [
        -4.75,
        -0.49
      ],
      [
        -4.71,
        1.34
      ],
      [
        -4.74,
        1.34
      ],
      [
        -4.72,
        2.26
      ],
      [
        -4.43,
        2.25
      ],
      [
        -4.43,
        2.13
      ],
      [
        -4.37,
        2.12
      ],
      [
        -4.41,
        1.05
      ],
      [
        -3.98,
        1.04
      ],
      [
        -4.01,
        -0.34
      ],
      [
        -4.28,
        -0.33
      ],
      [
        -4.28,
        -0.42
      ],
      [
        -4.37,
        -0.42
      ]
    ]
  },
  {
    "id": "osm-bldg-38",
    "name": "Campus Building #38",
    "minX": 2.0,
    "maxX": 3.23,
    "minZ": -8.22,
    "maxZ": -7.22,
    "height": 0.67,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        2.31,
        -8.22
      ],
      [
        2.05,
        -8.21
      ],
      [
        2.06,
        -8.03
      ],
      [
        2.0,
        -8.02
      ],
      [
        2.02,
        -7.6
      ],
      [
        2.57,
        -7.62
      ],
      [
        2.58,
        -7.58
      ],
      [
        2.02,
        -7.55
      ],
      [
        2.03,
        -7.22
      ],
      [
        3.23,
        -7.26
      ],
      [
        3.22,
        -7.59
      ],
      [
        2.79,
        -7.58
      ],
      [
        2.79,
        -7.62
      ],
      [
        2.95,
        -7.63
      ],
      [
        2.95,
        -7.66
      ],
      [
        3.05,
        -7.66
      ],
      [
        3.05,
        -7.63
      ],
      [
        3.22,
        -7.64
      ],
      [
        3.21,
        -8.06
      ],
      [
        3.04,
        -8.05
      ],
      [
        3.04,
        -8.03
      ],
      [
        2.94,
        -8.02
      ],
      [
        2.94,
        -8.05
      ],
      [
        2.77,
        -8.04
      ],
      [
        2.77,
        -7.93
      ],
      [
        2.56,
        -7.92
      ],
      [
        2.56,
        -8.04
      ],
      [
        2.32,
        -8.03
      ]
    ]
  },
  {
    "id": "osm-bldg-39",
    "name": "Campus Building #39",
    "minX": -7.23,
    "maxX": -7.02,
    "minZ": 4.58,
    "maxZ": 4.99,
    "height": 0.61,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -7.02,
        4.58
      ],
      [
        -7.23,
        4.58
      ],
      [
        -7.23,
        4.99
      ],
      [
        -7.02,
        4.99
      ]
    ]
  },
  {
    "id": "osm-bldg-40",
    "name": "Campus Building #40",
    "minX": 2.43,
    "maxX": 4.01,
    "minZ": -6.06,
    "maxZ": -4.85,
    "height": 1.0,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        2.43,
        -4.85
      ],
      [
        3.99,
        -4.9
      ],
      [
        4.01,
        -6.06
      ],
      [
        2.43,
        -5.99
      ]
    ]
  },
  {
    "id": "osm-bldg-41",
    "name": "Campus Building #41",
    "minX": -1.8,
    "maxX": -0.44,
    "minZ": 1.78,
    "maxZ": 3.45,
    "height": 1.04,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -1.71,
        2.51
      ],
      [
        -1.8,
        2.52
      ],
      [
        -1.78,
        3.01
      ],
      [
        -1.7,
        3.01
      ],
      [
        -1.67,
        3.45
      ],
      [
        -1.33,
        3.45
      ],
      [
        -1.33,
        3.37
      ],
      [
        -0.87,
        3.35
      ],
      [
        -0.87,
        3.42
      ],
      [
        -0.52,
        3.42
      ],
      [
        -0.53,
        2.97
      ],
      [
        -0.44,
        2.96
      ],
      [
        -0.47,
        2.47
      ],
      [
        -0.55,
        2.48
      ],
      [
        -0.57,
        1.78
      ],
      [
        -1.74,
        1.82
      ]
    ]
  },
  {
    "id": "osm-bldg-42",
    "name": "Campus Building #42",
    "minX": 0.09,
    "maxX": 2.87,
    "minZ": -2.98,
    "maxZ": -1.78,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        0.09,
        -2.91
      ],
      [
        0.14,
        -1.78
      ],
      [
        1.96,
        -1.85
      ],
      [
        1.95,
        -2.12
      ],
      [
        2.05,
        -2.13
      ],
      [
        2.06,
        -2.03
      ],
      [
        2.87,
        -2.06
      ],
      [
        2.84,
        -2.84
      ],
      [
        2.05,
        -2.81
      ],
      [
        2.06,
        -2.67
      ],
      [
        1.89,
        -2.67
      ],
      [
        1.88,
        -2.98
      ]
    ]
  },
  {
    "id": "osm-bldg-43",
    "name": "Campus Building #43",
    "minX": 4.29,
    "maxX": 4.44,
    "minZ": -7.75,
    "maxZ": -7.5,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        4.31,
        -7.75
      ],
      [
        4.29,
        -7.5
      ],
      [
        4.32,
        -7.51
      ],
      [
        4.37,
        -7.52
      ],
      [
        4.42,
        -7.51
      ],
      [
        4.44,
        -7.5
      ],
      [
        4.41,
        -7.75
      ]
    ]
  },
  {
    "id": "osm-bldg-44",
    "name": "Campus Building #44",
    "minX": 5.08,
    "maxX": 5.24,
    "minZ": 1.69,
    "maxZ": 1.8,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        5.24,
        1.8
      ],
      [
        5.23,
        1.69
      ],
      [
        5.08,
        1.7
      ],
      [
        5.08,
        1.8
      ]
    ]
  },
  {
    "id": "osm-bldg-45",
    "name": "Campus Building #45",
    "minX": 4.93,
    "maxX": 4.96,
    "minZ": -3.15,
    "maxZ": -3.12,
    "height": 0.9,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        4.96,
        -3.12
      ],
      [
        4.96,
        -3.15
      ],
      [
        4.93,
        -3.15
      ],
      [
        4.93,
        -3.12
      ]
    ]
  },
  {
    "id": "osm-bldg-46",
    "name": "Campus Building #46",
    "minX": 5.85,
    "maxX": 5.89,
    "minZ": -4.51,
    "maxZ": -4.46,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        5.89,
        -4.47
      ],
      [
        5.89,
        -4.51
      ],
      [
        5.85,
        -4.51
      ],
      [
        5.85,
        -4.46
      ]
    ]
  },
  {
    "id": "osm-bldg-47",
    "name": "Campus Building #47",
    "minX": -7.39,
    "maxX": -6.91,
    "minZ": 7.79,
    "maxZ": 8.25,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -7.04,
        8.25
      ],
      [
        -6.91,
        8.11
      ],
      [
        -7.26,
        7.79
      ],
      [
        -7.39,
        7.92
      ]
    ]
  },
  {
    "id": "osm-bldg-48",
    "name": "Campus Building #48",
    "minX": -6.37,
    "maxX": -6.05,
    "minZ": 8.03,
    "maxZ": 8.13,
    "height": 0.58,
    "color": 3900150,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "pts": [
      [
        -6.37,
        8.04
      ],
      [
        -6.36,
        8.13
      ],
      [
        -6.05,
        8.12
      ],
      [
        -6.06,
        8.03
      ]
    ]
  },
  {
    "id": "osm-walkways",
    "name": "Campus Sidewalk & Crosswalk Network",
    "minX": -11.8,
    "maxX": 11.8,
    "minZ": -10.8,
    "maxZ": 10.8,
    "height": 0.02,
    "color": 9741240,
    "userCreated": false,
    "hardcoded": true,
    "permanentSolid": true,
    "isWalkwayNetwork": true,
    "boxes": [
      [
        -2.55,
        2.65,
        -1.72,
        1.72
      ]
    ],
    "polylines": [
      [
        [
          -0.44,
          -4.9
        ],
        [
          -0.06,
          -4.92
        ],
        [
          0.38,
          -4.96
        ],
        [
          0.48,
          -5.06
        ],
        [
          0.57,
          -4.98
        ],
        [
          1.92,
          -4.98
        ],
        [
          1.94,
          -3.39
        ],
        [
          3.0,
          -4.63
        ],
        [
          2.99,
          -4.83
        ]
      ],
      [
        [
          5.43,
          -3.42
        ],
        [
          5.32,
          -3.36
        ],
        [
          3.04,
          -3.25
        ],
        [
          3.0,
          -4.63
        ]
      ],
      [
        [
          -0.1,
          -6.05
        ],
        [
          -0.06,
          -4.92
        ],
        [
          -0.01,
          -3.28
        ],
        [
          0.0,
          -3.16
        ],
        [
          0.44,
          -4.83
        ],
        [
          1.93,
          -3.31
        ]
      ],
      [
        [
          0.4,
          -7.12
        ],
        [
          0.46,
          -6.15
        ],
        [
          0.46,
          -5.84
        ],
        [
          0.48,
          -5.06
        ]
      ],
      [
        [
          0.38,
          -4.96
        ],
        [
          0.44,
          -4.83
        ]
      ],
      [
        [
          1.93,
          -3.31
        ],
        [
          1.97,
          -2.25
        ]
      ],
      [
        [
          3.04,
          -3.25
        ],
        [
          3.11,
          -1.3
        ],
        [
          3.12,
          -1.0
        ]
      ],
      [
        [
          1.99,
          -1.7
        ],
        [
          2.01,
          -1.27
        ],
        [
          3.11,
          -1.3
        ]
      ],
      [
        [
          2.43,
          -5.48
        ],
        [
          2.19,
          -5.65
        ],
        [
          1.74,
          -6.11
        ],
        [
          1.6,
          -6.26
        ],
        [
          1.0,
          -6.83
        ],
        [
          0.85,
          -7.05
        ]
      ],
      [
        [
          9.05,
          1.07
        ],
        [
          8.99,
          -0.57
        ],
        [
          8.95,
          -1.72
        ],
        [
          8.92,
          -2.6
        ],
        [
          8.84,
          -2.72
        ],
        [
          8.68,
          -2.77
        ]
      ],
      [
        [
          8.84,
          -3.28
        ],
        [
          8.89,
          -3.44
        ],
        [
          8.84,
          -5.01
        ],
        [
          8.78,
          -6.86
        ],
        [
          8.81,
          -7.25
        ],
        [
          8.77,
          -7.74
        ],
        [
          8.72,
          -8.42
        ],
        [
          8.7,
          -8.95
        ],
        [
          8.68,
          -9.84
        ]
      ],
      [
        [
          9.05,
          1.07
        ],
        [
          8.95,
          1.15
        ],
        [
          8.82,
          1.18
        ],
        [
          6.89,
          1.25
        ],
        [
          6.68,
          1.22
        ],
        [
          6.52,
          1.18
        ],
        [
          6.39,
          1.11
        ],
        [
          6.26,
          1.01
        ],
        [
          6.14,
          0.87
        ],
        [
          6.06,
          0.71
        ],
        [
          6.02,
          0.57
        ],
        [
          6.0,
          0.4
        ]
      ],
      [
        [
          3.11,
          -1.19
        ],
        [
          4.46,
          -1.24
        ],
        [
          5.29,
          -1.37
        ],
        [
          5.43,
          -1.33
        ],
        [
          5.51,
          -1.2
        ],
        [
          5.53,
          -0.58
        ]
      ],
      [
        [
          6.16,
          1.14
        ],
        [
          6.24,
          1.04
        ]
      ],
      [
        [
          5.77,
          0.41
        ],
        [
          5.61,
          0.42
        ]
      ],
      [
        [
          5.96,
          0.4
        ],
        [
          5.8,
          0.41
        ]
      ],
      [
        [
          5.98,
          1.24
        ],
        [
          6.16,
          1.14
        ]
      ],
      [
        [
          5.63,
          1.25
        ],
        [
          5.8,
          1.24
        ]
      ],
      [
        [
          5.83,
          1.24
        ],
        [
          5.98,
          1.24
        ]
      ],
      [
        [
          5.44,
          -3.07
        ],
        [
          5.48,
          -1.67
        ]
      ],
      [
        [
          5.48,
          -1.67
        ],
        [
          5.48,
          -1.46
        ],
        [
          5.48,
          -1.33
        ]
      ],
      [
        [
          5.43,
          -3.38
        ],
        [
          5.43,
          -3.26
        ],
        [
          5.44,
          -3.07
        ]
      ],
      [
        [
          2.99,
          -4.73
        ],
        [
          5.39,
          -4.82
        ]
      ],
      [
        [
          5.46,
          -3.42
        ],
        [
          5.75,
          -3.42
        ]
      ],
      [
        [
          5.83,
          -3.43
        ],
        [
          5.97,
          -3.43
        ]
      ],
      [
        [
          4.68,
          -8.32
        ],
        [
          4.99,
          -8.35
        ],
        [
          5.14,
          -8.34
        ],
        [
          5.26,
          -8.24
        ],
        [
          5.3,
          -7.81
        ],
        [
          5.35,
          -6.17
        ],
        [
          5.39,
          -4.82
        ],
        [
          5.43,
          -3.42
        ]
      ],
      [
        [
          5.21,
          -10.59
        ],
        [
          5.27,
          -9.04
        ],
        [
          5.24,
          -8.9
        ]
      ],
      [
        [
          5.24,
          -8.84
        ],
        [
          5.24,
          -8.67
        ],
        [
          5.24,
          -8.48
        ],
        [
          5.24,
          -8.32
        ]
      ],
      [
        [
          5.43,
          -4.82
        ],
        [
          5.6,
          -4.76
        ]
      ],
      [
        [
          5.79,
          -4.71
        ],
        [
          5.93,
          -4.71
        ]
      ],
      [
        [
          5.63,
          -4.76
        ],
        [
          5.79,
          -4.71
        ]
      ],
      [
        [
          5.24,
          -8.32
        ],
        [
          5.16,
          -8.2
        ]
      ],
      [
        [
          4.21,
          -8.31
        ],
        [
          4.48,
          -8.32
        ]
      ],
      [
        [
          4.48,
          -8.32
        ],
        [
          4.61,
          -8.32
        ]
      ],
      [
        [
          4.0,
          -8.3
        ],
        [
          4.21,
          -8.31
        ]
      ],
      [
        [
          6.1,
          4.96
        ],
        [
          6.18,
          5.06
        ],
        [
          6.32,
          5.11
        ],
        [
          8.51,
          5.04
        ]
      ],
      [
        [
          5.64,
          2.76
        ],
        [
          5.64,
          2.9
        ],
        [
          5.65,
          3.03
        ]
      ],
      [
        [
          5.55,
          1.7
        ],
        [
          5.62,
          1.86
        ],
        [
          5.64,
          2.67
        ]
      ],
      [
        [
          5.54,
          1.35
        ],
        [
          5.55,
          1.61
        ]
      ],
      [
        [
          5.65,
          3.03
        ],
        [
          5.67,
          3.16
        ],
        [
          5.72,
          4.95
        ]
      ],
      [
        [
          5.76,
          4.96
        ],
        [
          6.03,
          4.96
        ]
      ],
      [
        [
          5.71,
          5.06
        ],
        [
          5.72,
          5.2
        ],
        [
          5.72,
          5.34
        ]
      ],
      [
        [
          -2.52,
          5.58
        ],
        [
          -0.02,
          5.5
        ],
        [
          2.42,
          5.42
        ]
      ],
      [
        [
          -0.01,
          5.54
        ],
        [
          -0.09,
          3.23
        ],
        [
          -0.12,
          2.44
        ],
        [
          -0.12,
          2.29
        ],
        [
          -0.14,
          1.67
        ]
      ],
      [
        [
          3.35,
          5.35
        ],
        [
          3.34,
          5.19
        ]
      ],
      [
        [
          5.54,
          1.31
        ],
        [
          4.07,
          1.4
        ]
      ],
      [
        [
          5.54,
          -0.3
        ],
        [
          5.57,
          0.42
        ],
        [
          5.6,
          1.19
        ],
        [
          5.54,
          1.31
        ]
      ],
      [
        [
          5.53,
          -0.58
        ],
        [
          5.54,
          -0.45
        ],
        [
          5.54,
          -0.3
        ]
      ],
      [
        [
          3.34,
          5.19
        ],
        [
          3.3,
          4.29
        ],
        [
          3.3,
          4.1
        ],
        [
          3.29,
          3.43
        ],
        [
          3.25,
          2.37
        ],
        [
          3.22,
          1.43
        ],
        [
          3.2,
          0.81
        ]
      ],
      [
        [
          3.3,
          2.37
        ],
        [
          3.49,
          2.36
        ]
      ],
      [
        [
          3.3,
          2.37
        ],
        [
          3.0,
          2.38
        ]
      ],
      [
        [
          3.49,
          2.36
        ],
        [
          3.67,
          2.36
        ]
      ],
      [
        [
          3.67,
          2.36
        ],
        [
          3.85,
          2.35
        ],
        [
          4.06,
          2.35
        ]
      ],
      [
        [
          4.13,
          2.35
        ],
        [
          4.34,
          2.35
        ]
      ],
      [
        [
          4.66,
          5.35
        ],
        [
          5.56,
          5.32
        ],
        [
          5.7,
          5.37
        ],
        [
          5.84,
          8.05
        ]
      ],
      [
        [
          4.5,
          5.35
        ],
        [
          4.66,
          5.35
        ]
      ],
      [
        [
          4.24,
          5.57
        ],
        [
          4.24,
          5.4
        ]
      ],
      [
        [
          4.24,
          5.32
        ],
        [
          4.23,
          5.16
        ]
      ],
      [
        [
          4.23,
          5.16
        ],
        [
          4.14,
          5.03
        ],
        [
          4.05,
          4.93
        ],
        [
          3.95,
          4.82
        ],
        [
          3.83,
          4.68
        ],
        [
          3.73,
          4.55
        ],
        [
          3.65,
          4.46
        ],
        [
          3.3,
          4.1
        ]
      ],
      [
        [
          3.35,
          5.43
        ],
        [
          3.36,
          5.6
        ]
      ],
      [
        [
          0.07,
          8.18
        ],
        [
          -0.01,
          5.71
        ]
      ],
      [
        [
          -0.01,
          5.71
        ],
        [
          -0.01,
          5.54
        ]
      ],
      [
        [
          2.58,
          5.42
        ],
        [
          3.35,
          5.39
        ],
        [
          4.24,
          5.36
        ],
        [
          4.5,
          5.35
        ]
      ],
      [
        [
          2.42,
          5.42
        ],
        [
          2.58,
          5.42
        ]
      ],
      [
        [
          0.0,
          -3.16
        ],
        [
          1.94,
          -3.22
        ]
      ],
      [
        [
          4.02,
          -7.77
        ],
        [
          4.19,
          -7.78
        ]
      ],
      [
        [
          4.19,
          -7.78
        ],
        [
          4.53,
          -7.78
        ]
      ],
      [
        [
          4.53,
          -7.78
        ],
        [
          4.69,
          -7.79
        ]
      ],
      [
        [
          4.69,
          -7.79
        ],
        [
          5.07,
          -7.8
        ],
        [
          5.3,
          -7.81
        ]
      ],
      [
        [
          5.07,
          -7.8
        ],
        [
          5.09,
          -7.92
        ],
        [
          5.01,
          -8.01
        ]
      ],
      [
        [
          5.06,
          -8.25
        ],
        [
          5.03,
          -8.13
        ],
        [
          5.16,
          -8.1
        ],
        [
          5.14,
          -8.22
        ]
      ],
      [
        [
          5.02,
          -8.2
        ],
        [
          4.99,
          -8.35
        ]
      ],
      [
        [
          4.0,
          -8.3
        ],
        [
          3.72,
          -8.29
        ],
        [
          3.57,
          -8.29
        ],
        [
          3.4,
          -8.29
        ],
        [
          3.23,
          -8.3
        ],
        [
          2.99,
          -8.36
        ],
        [
          2.86,
          -8.41
        ],
        [
          2.75,
          -8.47
        ],
        [
          2.55,
          -8.61
        ],
        [
          2.47,
          -8.7
        ],
        [
          2.35,
          -8.86
        ],
        [
          2.18,
          -8.96
        ],
        [
          2.02,
          -9.01
        ],
        [
          1.85,
          -9.03
        ],
        [
          1.54,
          -8.97
        ],
        [
          1.2,
          -8.9
        ],
        [
          0.02,
          -8.86
        ],
        [
          -0.36,
          -8.96
        ],
        [
          -0.48,
          -8.94
        ],
        [
          -0.68,
          -8.86
        ],
        [
          -0.8,
          -8.79
        ],
        [
          -0.85,
          -8.55
        ],
        [
          -0.9,
          -8.28
        ],
        [
          -0.93,
          -8.11
        ],
        [
          -0.95,
          -7.99
        ],
        [
          -0.97,
          -7.85
        ]
      ],
      [
        [
          5.22,
          -8.87
        ],
        [
          5.06,
          -8.79
        ],
        [
          4.72,
          -8.77
        ],
        [
          4.16,
          -8.74
        ],
        [
          3.39,
          -8.72
        ],
        [
          3.2,
          -8.75
        ],
        [
          3.03,
          -8.81
        ],
        [
          2.86,
          -8.92
        ],
        [
          2.77,
          -9.02
        ],
        [
          2.75,
          -9.93
        ]
      ],
      [
        [
          2.69,
          -8.77
        ],
        [
          2.61,
          -8.67
        ]
      ],
      [
        [
          2.34,
          -9.48
        ],
        [
          1.86,
          -9.47
        ],
        [
          1.74,
          -9.47
        ]
      ],
      [
        [
          1.85,
          -9.23
        ],
        [
          1.85,
          -9.07
        ]
      ],
      [
        [
          0.49,
          -9.42
        ],
        [
          1.15,
          -9.44
        ]
      ],
      [
        [
          1.15,
          -9.04
        ],
        [
          1.14,
          -8.89
        ]
      ],
      [
        [
          1.74,
          -9.62
        ],
        [
          1.73,
          -9.76
        ]
      ],
      [
        [
          1.73,
          -9.76
        ],
        [
          1.72,
          -10.04
        ]
      ],
      [
        [
          1.74,
          -9.48
        ],
        [
          1.74,
          -9.62
        ]
      ],
      [
        [
          1.15,
          -9.59
        ],
        [
          1.14,
          -9.75
        ]
      ],
      [
        [
          1.14,
          -9.75
        ],
        [
          1.14,
          -10.02
        ]
      ],
      [
        [
          1.15,
          -9.46
        ],
        [
          1.15,
          -9.59
        ]
      ],
      [
        [
          -0.63,
          -9.3
        ],
        [
          -0.59,
          -9.14
        ]
      ],
      [
        [
          -0.65,
          -9.4
        ],
        [
          -0.67,
          -9.62
        ]
      ],
      [
        [
          1.91,
          -6.87
        ],
        [
          1.61,
          -6.92
        ],
        [
          1.06,
          -7.01
        ],
        [
          0.85,
          -7.05
        ],
        [
          0.4,
          -7.12
        ],
        [
          -0.02,
          -7.19
        ],
        [
          -0.36,
          -7.25
        ],
        [
          -0.64,
          -7.3
        ],
        [
          -1.05,
          -7.36
        ],
        [
          -1.13,
          -7.53
        ],
        [
          -0.64,
          -7.45
        ],
        [
          -0.33,
          -7.4
        ],
        [
          0.0,
          -7.34
        ],
        [
          0.39,
          -7.28
        ],
        [
          1.09,
          -7.16
        ],
        [
          1.06,
          -7.01
        ]
      ],
      [
        [
          -0.42,
          -6.04
        ],
        [
          -0.1,
          -6.05
        ],
        [
          0.46,
          -6.06
        ],
        [
          1.74,
          -6.11
        ],
        [
          1.88,
          -6.11
        ],
        [
          1.85,
          -6.88
        ]
      ],
      [
        [
          -0.98,
          -7.77
        ],
        [
          -1.02,
          -7.55
        ],
        [
          -1.05,
          -7.36
        ]
      ],
      [
        [
          -0.64,
          -7.45
        ],
        [
          -0.67,
          -7.3
        ]
      ],
      [
        [
          -0.64,
          -7.3
        ],
        [
          -0.66,
          -7.13
        ]
      ],
      [
        [
          -0.33,
          -7.4
        ],
        [
          -0.36,
          -7.25
        ]
      ],
      [
        [
          0.0,
          -7.34
        ],
        [
          -0.02,
          -7.19
        ]
      ],
      [
        [
          0.39,
          -7.28
        ],
        [
          0.36,
          -7.13
        ]
      ],
      [
        [
          1.61,
          -6.92
        ],
        [
          1.81,
          -8.14
        ],
        [
          1.89,
          -8.46
        ],
        [
          1.54,
          -8.97
        ]
      ],
      [
        [
          4.02,
          -7.77
        ],
        [
          3.45,
          -7.75
        ]
      ],
      [
        [
          4.0,
          -7.76
        ],
        [
          4.04,
          -7.63
        ],
        [
          4.15,
          -7.54
        ],
        [
          4.27,
          -7.53
        ],
        [
          4.5,
          -7.54
        ],
        [
          4.62,
          -7.58
        ],
        [
          4.7,
          -7.7
        ]
      ],
      [
        [
          -8.79,
          -5.64
        ],
        [
          -8.69,
          -2.11
        ],
        [
          -8.62,
          -0.18
        ],
        [
          -8.41,
          6.31
        ],
        [
          -8.3,
          9.13
        ],
        [
          -8.24,
          9.3
        ],
        [
          -8.24,
          9.6
        ],
        [
          -8.23,
          9.8
        ],
        [
          -8.27,
          10.0
        ],
        [
          -8.27,
          10.16
        ]
      ],
      [
        [
          -2.0,
          -7.36
        ],
        [
          -1.86,
          -7.0
        ]
      ],
      [
        [
          -1.86,
          -7.0
        ],
        [
          -1.85,
          -6.88
        ]
      ],
      [
        [
          -1.83,
          -6.76
        ],
        [
          -1.76,
          -6.63
        ]
      ],
      [
        [
          -1.76,
          -6.63
        ],
        [
          -1.68,
          -6.49
        ]
      ],
      [
        [
          3.29,
          1.49
        ],
        [
          3.39,
          1.61
        ]
      ],
      [
        [
          4.05,
          1.4
        ],
        [
          3.28,
          1.43
        ],
        [
          3.12,
          1.43
        ]
      ],
      [
        [
          -3.04,
          2.92
        ],
        [
          -3.49,
          2.93
        ],
        [
          -3.82,
          2.94
        ],
        [
          -4.38,
          2.95
        ],
        [
          -4.74,
          2.96
        ],
        [
          -4.98,
          3.13
        ]
      ],
      [
        [
          -4.38,
          2.95
        ],
        [
          -4.41,
          2.13
        ]
      ],
      [
        [
          -3.49,
          2.93
        ],
        [
          -3.51,
          2.3
        ]
      ],
      [
        [
          -3.11,
          1.11
        ],
        [
          -3.55,
          1.13
        ],
        [
          -4.21,
          1.14
        ],
        [
          -4.4,
          1.15
        ]
      ],
      [
        [
          -4.21,
          1.14
        ],
        [
          -4.26,
          1.25
        ],
        [
          -4.3,
          1.48
        ],
        [
          -4.31,
          1.69
        ],
        [
          -4.31,
          1.81
        ],
        [
          -4.27,
          2.01
        ],
        [
          -4.17,
          2.1
        ],
        [
          -3.88,
          1.78
        ],
        [
          -3.67,
          2.24
        ],
        [
          -3.51,
          2.3
        ],
        [
          -3.32,
          2.19
        ],
        [
          -3.19,
          2.01
        ],
        [
          -3.15,
          1.82
        ],
        [
          -3.15,
          1.68
        ],
        [
          -3.21,
          1.54
        ],
        [
          -3.34,
          1.47
        ],
        [
          -3.54,
          1.46
        ],
        [
          -3.55,
          1.13
        ]
      ],
      [
        [
          -3.54,
          1.46
        ],
        [
          -3.53,
          1.68
        ]
      ],
      [
        [
          -2.86,
          -2.05
        ],
        [
          -3.13,
          -2.04
        ]
      ],
      [
        [
          -3.11,
          1.11
        ],
        [
          -2.84,
          1.11
        ]
      ],
      [
        [
          -2.76,
          1.1
        ],
        [
          -2.52,
          1.1
        ]
      ],
      [
        [
          2.01,
          -1.27
        ],
        [
          2.01,
          -1.13
        ],
        [
          -2.59,
          -0.97
        ],
        [
          -2.52,
          1.1
        ],
        [
          -2.5,
          1.76
        ]
      ],
      [
        [
          -2.2,
          -1.25
        ],
        [
          2.25,
          -1.25
        ],
        [
          2.25,
          1.25
        ],
        [
          -2.2,
          1.25
        ],
        [
          -2.2,
          -1.25
        ]
      ],
      [
        [
          -2.6,
          -1.65
        ],
        [
          2.55,
          -1.65
        ],
        [
          2.55,
          1.65
        ],
        [
          -2.6,
          1.65
        ],
        [
          -2.6,
          -1.65
        ]
      ],
      [
        [
          -2.6,
          -8.5
        ],
        [
          -2.6,
          8.5
        ]
      ],
      [
        [
          -3.45,
          -8.5
        ],
        [
          -3.45,
          8.5
        ]
      ],
      [
        [
          -3.55,
          -3.15
        ],
        [
          -2.2,
          -3.15
        ]
      ],
      [
        [
          -3.55,
          -1.3
        ],
        [
          -2.15,
          -1.25
        ]
      ],
      [
        [
          -3.55,
          0.35
        ],
        [
          -2.15,
          0.35
        ]
      ],
      [
        [
          -3.55,
          1.35
        ],
        [
          -2.15,
          1.25
        ]
      ],
      [
        [
          -3.55,
          -3.15
        ],
        [
          -3.55,
          2.4
        ],
        [
          -4.95,
          2.4
        ]
      ],
      [
        [
          -2.6,
          -1.65
        ],
        [
          -2.6,
          -3.6
        ],
        [
          2.0,
          -3.6
        ],
        [
          2.0,
          -6.2
        ],
        [
          3.5,
          -6.2
        ]
      ],
      [
        [
          2.25,
          -1.25
        ],
        [
          2.25,
          -2.5
        ],
        [
          3.05,
          -2.5
        ],
        [
          3.05,
          -4.65
        ],
        [
          2.0,
          -4.65
        ]
      ],
      [
        [
          2.25,
          -1.25
        ],
        [
          4.65,
          -1.25
        ],
        [
          4.65,
          1.25
        ],
        [
          2.25,
          1.25
        ]
      ],
      [
        [
          4.65,
          -1.5
        ],
        [
          6.0,
          -1.5
        ]
      ],
      [
        [
          4.65,
          1.5
        ],
        [
          6.0,
          1.5
        ]
      ],
      [
        [
          5.25,
          -8.5
        ],
        [
          5.25,
          8.5
        ]
      ],
      [
        [
          0.15,
          1.25
        ],
        [
          0.15,
          3.6
        ]
      ],
      [
        [
          -2.6,
          3.55
        ],
        [
          3.25,
          3.55
        ]
      ]
    ]
  }
].map(Object.freeze));

export const DEFAULT_CAMPUS_STATION_POSITIONS = Object.freeze({
  inventory:   Object.freeze({ x: -2.15, y: 0.05, z:  0.00 }),
  testing:     Object.freeze({ x:  0.00, y: 0.05, z: -1.22 }),
  electronics: Object.freeze({ x:  2.22, y: 0.05, z:  0.00 }),
  charger:     Object.freeze({ x:  0.00, y: 0.05, z:  1.25 }),
  helipad:     Object.freeze({ x: -2.15, y: 0.05, z: -1.22 })
});

// Official MDC North Campus Numbered Building Destinations matching campus CAD map
export const MDC_NORTH_CAMPUS_DESTINATIONS = Object.freeze([
  {
    id: 'bldg-1',
    code: '1',
    name: 'Building 1 North Campus',
    type: 'Administration & Library',
    center: Object.freeze({ x: 3.604, y: 1.25, z: -0.042 }),
    dropoff: Object.freeze({ x: 5.229, y: 0.05, z: -0.075 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-2',
    code: '2',
    name: 'Building 2 North Campus',
    type: 'Academic South Wing',
    center: Object.freeze({ x: 1.727, y: 1.20, z: 2.478 }),
    dropoff: Object.freeze({ x: 2.395, y: 0.05, z: 3.711 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-3',
    code: '3',
    name: 'Building 3 North Campus',
    type: 'Academic North Wing',
    center: Object.freeze({ x: 1.332, y: 1.10, z: -1.994 }),
    dropoff: Object.freeze({ x: 1.399, y: 0.05, z: -1.493 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-4',
    code: '4',
    name: 'Building 4 North Campus',
    type: 'Science & Technology Complex',
    center: Object.freeze({ x: 2.943, y: 1.10, z: -5.247 }),
    dropoff: Object.freeze({ x: 4.377, y: 0.05, z: -5.445 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-5',
    code: '5',
    name: 'Building 5 North Campus',
    type: 'Student Center & Lehman Theater',
    center: Object.freeze({ x: -1.168, y: 1.15, z: 2.352 }),
    dropoff: Object.freeze({ x: -1.085, y: 0.05, z: 3.751 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-6',
    code: '6',
    name: 'Building 6 North Campus',
    type: 'Octagon Rotunda Lecture Hall',
    center: Object.freeze({ x: 2.855, y: 1.15, z: -2.647 }),
    dropoff: Object.freeze({ x: 2.475, y: 0.05, z: -3.450 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-7',
    code: '7',
    name: 'Building 7 North Campus',
    type: 'Business & Academic Annex',
    center: Object.freeze({ x: -0.753, y: 1.10, z: -2.384 }),
    dropoff: Object.freeze({ x: -0.995, y: 0.05, z: -1.373 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-8',
    code: '8',
    name: 'Building 8 North Campus',
    type: 'Student Services & Advisement',
    center: Object.freeze({ x: 2.598, y: 1.10, z: -7.676 }),
    dropoff: Object.freeze({ x: 2.290, y: 0.05, z: -8.471 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-9',
    code: '9',
    name: 'Building 9 North Campus',
    type: 'West Academic Complex',
    center: Object.freeze({ x: -3.722, y: 1.05, z: -1.913 }),
    dropoff: Object.freeze({ x: -4.463, y: 0.05, z: -2.576 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-a',
    code: 'A',
    name: 'Building A North Campus',
    type: 'Science',
    center: Object.freeze({ x: -3.933, y: 1.30, z: 0.660 }),
    dropoff: Object.freeze({ x: -3.787, y: 0.05, z: 0.109 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-20',
    code: '20',
    name: 'Building 20 North Campus',
    type: 'Academic Annex 20',
    center: Object.freeze({ x: 0.427, y: 0.90, z: -8.300 }),
    dropoff: Object.freeze({ x: 0.277, y: 0.05, z: -6.975 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  },
  {
    id: 'bldg-33',
    code: '33',
    name: 'Building 33 North Campus',
    type: 'Academic Annex 33',
    center: Object.freeze({ x: 7.552, y: 0.90, z: -8.783 }),
    dropoff: Object.freeze({ x: 6.686, y: 0.05, z: -8.487 }),
    color: 0x0047ba,
    badgeColor: '#0047ba'
  }
].map(Object.freeze));
