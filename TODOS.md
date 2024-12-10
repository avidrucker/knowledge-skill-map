# To-Do's

## Features 
- [ ] Implement cut node (requires a currently selected node), add cut button to node context menu
- [ ] Implement paste node (requires a cut node and a currently selected node), add paste to node context menu when a cut node is in the clipboard
- [ ] Implement cut tree (supercedes cut node), which cuts a node along with all of its children
- [ ] Implement paste tree (supercedes paste node), which pastes a node along with all of its children
- [ ] Implement export to JSON
- [ ] Implement import from JSON
- [ ] Implement export to mermaid
- [ ] Implement import from mermaid
- [ ] Implement zoom to fit button in right-click context menu OR background double-click
- [ ] Implement zoom to fit keyboard shortcut

## Fixes
- [ ] Fix label edit input field placement so that it is always perfectly in the middle of the node
- [ ] Fix issue where selected node's outline color changes to black when it shouldn't (it should only be black if the node's color is yellow, else it should be white)
- [ ] Fix label text not taking up the maximum width AND height of the node. (e.g. if there are 4 words in the label, probably the text label should be split into about 4 lines) Note: This issue may be releated to the max row length of the text label, which is currently set to 20 characters