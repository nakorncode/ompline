# Bundle a pinned omp build by default, with a PATH override

Each app release ships a pinned omp build, and Settings can point the app at an omp binary on PATH instead. omp releases almost daily and its behavior can change between them, so a bundled version keeps each app release tested against one known omp. The PATH override is for users who need a newer or different build. Updating the bundled omp is a deliberate step in the sync workflow, not automatic, and it makes the installer larger.
