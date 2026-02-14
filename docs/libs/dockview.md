# Dockview - Zero Dependency Layout Manager

Dockview is a comprehensive layout management library that provides tabbed interfaces, dockable panels, grid layouts, split views, and pane views for web applications. Built with TypeScript and zero runtime dependencies, it offers a framework-agnostic core with dedicated bindings for React, Vue, and Angular. The library supports advanced features including drag-and-drop panel management, floating groups, popout windows, comprehensive serialization for state persistence, and extensive programmatic control through a rich API surface.

The project follows a monorepo architecture with `dockview-core` providing the framework-agnostic layout engine, while framework-specific packages (`dockview`, `dockview-vue`, `dockview-angular`, `dockview-react`) offer thin wrappers that integrate seamlessly with each framework's lifecycle and component model. All implementations share the same serialization format, event system, and API patterns, ensuring consistent behavior across different frontend stacks while maintaining full TypeScript type safety and comprehensive test coverage.

## API Reference

### createDockview - Initialize Dockview Component

Factory function that creates a new dockview instance with tabbed panel groups, drag-and-drop support, and advanced layout features including floating groups and popout windows.

```typescript
import { createDockview } from 'dockview-core';
import 'dockview-core/dist/styles/dockview.css';

// Create container element
const container = document.getElementById('app');

// Define component factory
const api = createDockview(container, {
  createComponent: (options) => {
    const element = document.createElement('div');
    element.textContent = `Panel: ${options.id}`;

    return {
      element,
      init: (params) => {
        console.log('Panel initialized:', params.api.id);
        element.style.padding = '20px';
      },
      update: (params) => {
        console.log('Panel updated:', params.params);
      },
      dispose: () => {
        console.log('Panel disposed');
      }
    };
  },

  // Optional custom tab renderer
  createTabComponent: (options) => {
    const element = document.createElement('div');

    return {
      element,
      init: (params) => {
        element.textContent = params.title || params.api.id;
        element.style.padding = '8px 16px';
      }
    };
  },

  // Configuration options
  defaultTabComponent: 'default',
  className: 'my-dockview',
  theme: 'dockview-theme-dark',
  disableFloatingGroups: false,
  floatingGroupBounds: 'boundedWithinViewport',
  popoutUrl: '/popout.html',
  defaultRenderer: 'onlyWhenVisible'
});

// Add panels
const panel1 = api.addPanel({
  id: 'panel1',
  component: 'myComponent',
  title: 'First Panel',
  params: { data: 'value1' }
});

const panel2 = api.addPanel({
  id: 'panel2',
  component: 'myComponent',
  title: 'Second Panel',
  position: {
    referencePanel: 'panel1',
    direction: 'right'
  }
});

// Listen to events
api.onDidActivePanelChange((panel) => {
  console.log('Active panel:', panel?.id);
});

// Clean up
api.onDidRemovePanel((panel) => {
  console.log('Panel removed:', panel.id);
});
```

### DockviewApi.addPanel - Add Panel to Layout

Add a new panel to the dockview with positioning options, custom components, and constraints. Returns a panel reference for further manipulation.

```typescript
// Add panel to active group
const panel = api.addPanel({
  id: 'editor1',
  component: 'codeEditor',
  title: 'main.ts',
  params: {
    filename: 'main.ts',
    language: 'typescript'
  }
});

// Add panel with specific position
api.addPanel({
  id: 'terminal',
  component: 'terminal',
  title: 'Terminal',
  position: {
    referencePanel: 'editor1',
    direction: 'below'
  },
  minimumHeight: 100,
  maximumHeight: 400
});

// Add panel to new group on the right
api.addPanel({
  id: 'preview',
  component: 'browser',
  title: 'Preview',
  position: {
    direction: 'right'
  },
  minimumWidth: 300
});

// Add floating panel
api.addPanel({
  id: 'inspector',
  component: 'inspector',
  title: 'Inspector',
  floating: {
    x: 100,
    y: 100,
    width: 400,
    height: 500
  }
});

// Add inactive panel (doesn't steal focus)
api.addPanel({
  id: 'background',
  component: 'logger',
  title: 'Logs',
  inactive: true,
  renderer: 'always' // Keep rendered even when hidden
});

// Add with index position within group
api.addPanel({
  id: 'settings',
  component: 'settings',
  position: {
    referencePanel: 'editor1',
    direction: 'within',
    index: 0  // Insert at beginning of tab list
  }
});
```

### DockviewApi.toJSON / fromJSON - Serialize and Restore Layout

Save and restore the complete layout state including panel positions, group arrangements, floating windows, and active states.

```typescript
// Save layout to localStorage
const saveLayout = () => {
  const state = api.toJSON();
  localStorage.setItem('dockview-layout', JSON.stringify(state));
  console.log('Layout saved');
};

// Restore layout from localStorage
const restoreLayout = () => {
  try {
    const saved = localStorage.getItem('dockview-layout');
    if (saved) {
      const state = JSON.parse(saved);
      api.fromJSON(state);
      console.log('Layout restored');
    }
  } catch (error) {
    console.error('Failed to restore layout:', error);
  }
};

// Save layout on window close
window.addEventListener('beforeunload', saveLayout);

// Restore on initialization
api.onDidLayoutFromJSON(() => {
  console.log('Layout loaded, re-initializing panels');
  // Re-establish connections or refresh data
});

// Example serialized format
const exampleState = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: {
            id: 'group1',
            activePanel: 'panel1',
            panels: ['panel1', 'panel2']
          },
          size: 600
        },
        {
          type: 'leaf',
          data: {
            id: 'group2',
            activePanel: 'panel3',
            panels: ['panel3']
          },
          size: 400
        }
      ],
      size: 1000
    },
    width: 1000,
    height: 600,
    orientation: 'HORIZONTAL'
  },
  panels: {
    'panel1': {
      id: 'panel1',
      contentComponent: 'editor',
      title: 'main.ts',
      params: { filename: 'main.ts' }
    },
    'panel2': {
      id: 'panel2',
      contentComponent: 'editor',
      title: 'app.ts'
    },
    'panel3': {
      id: 'panel3',
      contentComponent: 'browser',
      title: 'Preview'
    }
  },
  activeGroup: 'group1',
  floatingGroups: [],
  popoutGroups: []
};

// Programmatically create layout
api.fromJSON(exampleState);
```

### DockviewPanelApi - Panel Instance Control

Programmatic interface for individual panel instances providing control over title, position, visibility, and lifecycle.

```typescript
// Get panel reference
const panel = api.getPanel('editor1');

if (panel) {
  // Update title
  panel.api.setTitle('main.ts *'); // Indicate unsaved changes

  // Listen to dimension changes
  panel.api.onDidDimensionsChange(({ width, height }) => {
    console.log(`Panel resized: ${width}x${height}`);
    // Trigger editor resize
  });

  // Listen to visibility changes
  panel.api.onDidVisibilityChange(({ isVisible }) => {
    if (isVisible) {
      console.log('Panel became visible');
      // Resume updates or refresh content
    } else {
      console.log('Panel hidden');
      // Pause expensive operations
    }
  });

  // Move panel to different group
  panel.api.moveTo({
    group: api.groups[1],
    position: 'center',
    index: 0
  });

  // Maximize panel
  if (!panel.api.isMaximized()) {
    panel.api.maximize();
  }

  // Exit maximized state
  panel.api.exitMaximized();

  // Update panel parameters
  panel.api.updateParameters({
    theme: 'dark',
    fontSize: 14
  });

  // Close panel
  panel.api.close();

  // Access panel properties
  console.log({
    id: panel.api.id,
    title: panel.api.title,
    isActive: panel.api.isActive,
    isVisible: panel.api.isVisible,
    isFocused: panel.api.isFocused,
    width: panel.api.width,
    height: panel.api.height,
    location: panel.api.location // 'grid' | 'floating' | 'popout'
  });
}
```

### Event Handling - React to Layout Changes

Subscribe to various layout and panel events to keep application state synchronized with the UI.

```typescript
// Panel lifecycle events
api.onDidAddPanel((panel) => {
  console.log('Panel added:', panel.id);
  // Initialize panel-specific resources
});

api.onDidRemovePanel((panel) => {
  console.log('Panel removed:', panel.id);
  // Clean up resources
});

api.onDidActivePanelChange((panel) => {
  if (panel) {
    console.log('Active panel changed to:', panel.id);
    // Update application state
  }
});

// Group events
api.onDidAddGroup((group) => {
  console.log('Group added:', group.id);
});

api.onDidRemoveGroup((group) => {
  console.log('Group removed:', group.id);
});

api.onDidActiveGroupChange((group) => {
  if (group) {
    console.log('Active group:', group.id);
  }
});

// Layout change events
api.onDidLayoutChange(() => {
  console.log('Layout changed');
  // Debounce and save layout
});

// Drag and drop events
api.onWillDrop((event) => {
  console.log('Will drop at:', event.position);
  // Optionally prevent drop
  if (event.position === 'center') {
    event.preventDefault();
  }
});

api.onDidDrop((event) => {
  console.log('Panel dropped');
  // Handle custom drop logic
});

// Panel movement tracking
api.onDidMovePanel((event) => {
  console.log(`Panel ${event.panel.id} moved from ${event.from.id} to ${event.to.id}`);
});

// Cleanup all event listeners
const disposables = [
  api.onDidAddPanel(() => {}),
  api.onDidRemovePanel(() => {}),
  api.onDidLayoutChange(() => {})
];

// Later: dispose all
disposables.forEach(d => d.dispose());
```

### Group Management - Organize Panels into Groups

Create and manage groups of tabbed panels with programmatic control over arrangement and behavior.

```typescript
// Add new empty group
const newGroup = api.addGroup({
  direction: 'right'
});

// Add group relative to existing panel
const group2 = api.addGroup({
  referencePanel: 'editor1',
  direction: 'below'
});

// Add group relative to existing group
const group3 = api.addGroup({
  referenceGroup: newGroup,
  direction: 'right'
});

// Lock group to prevent drag/drop
newGroup.api.setConstraints({
  locked: true
});

// Access group properties
console.log({
  id: newGroup.id,
  panels: newGroup.panels,
  activePanel: newGroup.activePanel,
  isActive: newGroup.api.isActive,
  location: newGroup.api.location
});

// Move group
newGroup.api.moveTo({
  group: group2,
  position: 'right'
});

// Close all panels in group (removes group)
api.removeGroup(newGroup);

// Close all groups
api.closeAllGroups();

// Get all groups
api.groups.forEach(group => {
  console.log(`Group ${group.id} has ${group.panels.length} panels`);
});

// Listen to group-level events
newGroup.api.onDidActivePanelChange((event) => {
  console.log('Group active panel:', event.panel?.id);
});
```

### Floating Groups and Popout Windows

Create floating panel groups and popout windows for multi-monitor workflows.

```typescript
// Add floating group with existing panel
api.addFloatingGroup(panel, {
  x: 200,
  y: 100,
  width: 600,
  height: 400
});

// Add floating group with existing group
api.addFloatingGroup(api.groups[0], {
  x: 100,
  y: 100,
  width: 800,
  height: 600
});

// Create popout window (returns promise)
const popoutSuccess = await api.addPopoutGroup(panel, {
  popoutUrl: '/popout.html',
  position: { x: 0, y: 0, width: 1024, height: 768 }
});

if (popoutSuccess) {
  console.log('Popout window created');
}

// Listen to popout events
api.onDidAddPopoutGroup((event) => {
  console.log('Popout group added');
});

api.onDidRemovePopoutGroup((event) => {
  console.log('Popout window closed');
});

// Panel will have updated location
panel.api.onDidLocationChange((event) => {
  console.log('Panel location changed:', event.location);
  // 'grid' | 'floating' | 'popout'
});

// Configure floating group bounds
api.updateOptions({
  floatingGroupBounds: {
    minimumHeightWithinViewport: 100,
    minimumWidthWithinViewport: 100
  }
});
```

### createGridview - Grid Layout Without Tabs

Create a grid layout manager for arranging panels without tab headers, ideal for dashboard-style layouts.

```typescript
import { createGridview, Orientation } from 'dockview-core';

const gridApi = createGridview(container, {
  orientation: Orientation.HORIZONTAL,
  proportionalLayout: true,

  createComponent: (options) => {
    const element = document.createElement('div');
    element.className = 'grid-panel';

    return {
      element,
      init: (params) => {
        element.textContent = `Grid Panel: ${params.api.id}`;
      }
    };
  }
});

// Add panels to grid
const gridPanel1 = gridApi.addPanel({
  id: 'chart1',
  component: 'chart',
  params: { type: 'line' },
  position: { direction: 'left' }
});

const gridPanel2 = gridApi.addPanel({
  id: 'chart2',
  component: 'chart',
  params: { type: 'bar' },
  position: {
    referencePanel: gridPanel1,
    direction: 'right'
  },
  minimumWidth: 200,
  minimumHeight: 150
});

// Move panel to different position
gridApi.movePanel(gridPanel1, {
  direction: 'below',
  reference: gridPanel2.id
});

// Layout and cleanup
gridApi.layout(1200, 800);
gridApi.dispose();
```

### createSplitview - Resizable Split Panels

Create a split view with resizable panels arranged horizontally or vertically, similar to VS Code's editor splits.

```typescript
import { createSplitview, Orientation } from 'dockview-core';

const splitApi = createSplitview(container, {
  orientation: Orientation.VERTICAL,
  proportionalLayout: false,

  createComponent: (options) => {
    const element = document.createElement('div');
    element.className = 'split-panel';

    return {
      element,
      init: (params) => {
        element.innerHTML = `<h3>${params.title}</h3>`;
      }
    };
  }
});

// Add panels with specific sizes
const split1 = splitApi.addPanel({
  id: 'editor',
  component: 'editor',
  params: { file: 'main.ts' },
  minimumSize: 100,
  maximumSize: 800,
  initialSize: 400,
  priority: 'high' // Layout priority when resizing
});

const split2 = splitApi.addPanel({
  id: 'terminal',
  component: 'terminal',
  index: 1,
  minimumSize: 50,
  initialSize: 200,
  snap: true // Enable snap behavior
});

// Access splitview properties
console.log({
  length: splitApi.length,
  orientation: splitApi.orientation,
  panels: splitApi.panels
});

// Move panels
splitApi.movePanel(1, 0); // Move panel from index 1 to 0

// Remove panel with sizing behavior
splitApi.removePanel(split2, 'distribute'); // Distribute space to others

// Change orientation
splitApi.updateOptions({
  orientation: Orientation.HORIZONTAL
});
```

### createPaneview - Collapsible Accordion Panels

Create a pane view with collapsible sections, similar to VS Code's sidebar panels.

```typescript
import { createPaneview } from 'dockview-core';

const paneApi = createPaneview(container, {
  disableDnd: false,

  createComponent: (options) => {
    const element = document.createElement('div');
    element.className = 'pane-content';

    return {
      element,
      init: (params) => {
        element.innerHTML = `<p>Content for ${params.title}</p>`;
      }
    };
  },

  createHeaderComponent: (options) => {
    const element = document.createElement('div');
    element.className = 'pane-header';

    return {
      element,
      init: (params) => {
        element.textContent = params.title || 'Panel';
      }
    };
  }
});

// Add panes
const explorerPane = paneApi.addPanel({
  id: 'explorer',
  component: 'fileTree',
  title: 'Explorer',
  params: { rootPath: '/project' },
  minimumSize: 100,
  initialSize: 300,
  expanded: true
});

const searchPane = paneApi.addPanel({
  id: 'search',
  component: 'search',
  title: 'Search',
  initialSize: 200,
  expanded: false
});

// Control expansion
explorerPane.api.setExpanded(false);
searchPane.api.setExpanded(true);

// Listen to expansion changes
explorerPane.api.onDidExpansionChange(({ isExpanded }) => {
  console.log('Explorer expanded:', isExpanded);
});

// Reorder panes
paneApi.movePanel(1, 0);

// Get pane by id
const pane = paneApi.getPanel('search');
if (pane) {
  pane.api.setExpanded(!pane.api.isExpanded);
}
```

### React Integration - DockviewReact Component

Use Dockview in React applications with full component lifecycle integration and hooks support.

```typescript
import React, { useRef, useState } from 'react';
import {
  DockviewReact,
  DockviewApi,
  IDockviewPanelProps
} from 'dockview';
import 'dockview/dist/styles/dockview.css';

// Define panel components
const EditorPanel: React.FC<IDockviewPanelProps> = (props) => {
  const [content, setContent] = useState(props.params.content || '');

  React.useEffect(() => {
    // Listen to dimension changes
    const disposer = props.api.onDidDimensionsChange(({ width, height }) => {
      console.log(`Editor resized: ${width}x${height}`);
    });

    return () => disposer.dispose();
  }, [props.api]);

  return (
    <div className="editor">
      <h3>{props.api.title}</h3>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

const PreviewPanel: React.FC<IDockviewPanelProps> = (props) => {
  return (
    <div className="preview">
      <iframe src={props.params.url} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

// Main application
const App: React.FC = () => {
  const apiRef = useRef<DockviewApi>();

  const onReady = (event: { api: DockviewApi }) => {
    apiRef.current = event.api;

    // Add initial panels
    event.api.addPanel({
      id: 'editor1',
      component: 'editor',
      title: 'main.tsx',
      params: { content: '// Start coding...' }
    });

    event.api.addPanel({
      id: 'preview1',
      component: 'preview',
      title: 'Preview',
      position: { referencePanel: 'editor1', direction: 'right' },
      params: { url: 'http://localhost:3000' }
    });
  };

  const addEditor = () => {
    if (apiRef.current) {
      apiRef.current.addPanel({
        id: `editor${Date.now()}`,
        component: 'editor',
        title: 'untitled',
        params: { content: '' }
      });
    }
  };

  return (
    <div style={{ height: '100vh' }}>
      <div>
        <button onClick={addEditor}>Add Editor</button>
        <button onClick={() => apiRef.current?.closeAllGroups()}>
          Close All
        </button>
      </div>

      <DockviewReact
        className="dockview-theme-dark"
        components={{
          editor: EditorPanel,
          preview: PreviewPanel
        }}
        onReady={onReady}
        onDidDrop={(event) => {
          console.log('Panel dropped');
        }}
      />
    </div>
  );
};

export default App;
```

### Vanilla TypeScript Usage - Complete Example

Full example showing initialization, panel management, serialization, and cleanup in pure TypeScript.

```typescript
import { createDockview, DockviewApi, IDockviewPanel } from 'dockview-core';
import 'dockview-core/dist/styles/dockview.css';

class DockviewManager {
  private api: DockviewApi;
  private panels = new Map<string, IDockviewPanel>();

  constructor(container: HTMLElement) {
    // Initialize dockview
    this.api = createDockview(container, {
      className: 'dockview-theme-dark',

      createComponent: (options) => {
        const element = document.createElement('div');
        element.className = 'panel-content';

        return {
          element,

          init: (params) => {
            element.innerHTML = `
              <div class="panel-header">
                <h3>${params.title || params.api.id}</h3>
              </div>
              <div class="panel-body">
                ${params.params?.content || 'Empty panel'}
              </div>
            `;

            // Store panel reference
            this.panels.set(params.api.id, params.api as unknown as IDockviewPanel);

            // Listen to parameter updates
            params.api.onDidParametersChange((newParams) => {
              const body = element.querySelector('.panel-body');
              if (body) {
                body.textContent = newParams.content || 'Empty';
              }
            });
          },

          update: (params) => {
            const body = element.querySelector('.panel-body');
            if (body) {
              body.textContent = params.params?.content || 'Empty';
            }
          },

          dispose: () => {
            this.panels.delete(element.dataset.panelId || '');
          }
        };
      },

      createTabComponent: (options) => {
        const element = document.createElement('div');
        element.className = 'custom-tab';

        return {
          element,
          init: (params) => {
            element.innerHTML = `
              <span class="tab-icon">📄</span>
              <span class="tab-title">${params.title || params.api.id}</span>
              <button class="tab-close" data-action="close">×</button>
            `;

            element.querySelector('[data-action="close"]')?.addEventListener('click', (e) => {
              e.stopPropagation();
              params.api.close();
            });
          },

          update: (params) => {
            const titleEl = element.querySelector('.tab-title');
            if (titleEl) {
              titleEl.textContent = params.title || params.api.id;
            }
          }
        };
      },

      defaultRenderer: 'onlyWhenVisible',
      floatingGroupBounds: 'boundedWithinViewport'
    });

    this.setupEventListeners();
    this.restoreLayout();
  }

  private setupEventListeners() {
    this.api.onDidAddPanel((panel) => {
      console.log('Panel added:', panel.id);
    });

    this.api.onDidRemovePanel((panel) => {
      console.log('Panel removed:', panel.id);
      this.panels.delete(panel.id);
    });

    this.api.onDidLayoutChange(() => {
      this.saveLayout();
    });

    // Auto-save on window close
    window.addEventListener('beforeunload', () => {
      this.saveLayout();
    });
  }

  addPanel(id: string, title: string, content: string) {
    return this.api.addPanel({
      id,
      component: 'default',
      title,
      params: { content }
    });
  }

  removePanel(id: string) {
    const panel = this.api.getPanel(id);
    if (panel) {
      this.api.removePanel(panel);
    }
  }

  updatePanelContent(id: string, content: string) {
    const panel = this.api.getPanel(id);
    if (panel) {
      panel.api.updateParameters({ content });
    }
  }

  private saveLayout() {
    try {
      const state = this.api.toJSON();
      localStorage.setItem('dockview-state', JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save layout:', error);
    }
  }

  private restoreLayout() {
    try {
      const saved = localStorage.getItem('dockview-state');
      if (saved) {
        const state = JSON.parse(saved);
        this.api.fromJSON(state);
        return;
      }
    } catch (error) {
      console.error('Failed to restore layout:', error);
    }

    // Create default layout
    this.createDefaultLayout();
  }

  private createDefaultLayout() {
    this.addPanel('panel1', 'Editor', '// Your code here');
    this.addPanel('panel2', 'Output', 'Console output...');

    const panel2 = this.api.getPanel('panel2');
    if (panel2) {
      panel2.api.moveTo({
        group: this.api.groups[0],
        position: 'below'
      });
    }
  }

  dispose() {
    this.saveLayout();
    this.api.dispose();
    this.panels.clear();
  }
}

// Usage
const container = document.getElementById('app');
if (container) {
  const manager = new DockviewManager(container);

  // Add button handlers
  document.getElementById('add-panel')?.addEventListener('click', () => {
    const id = `panel-${Date.now()}`;
    manager.addPanel(id, 'New Panel', 'Content');
  });

  // Cleanup on navigation
  window.addEventListener('beforeunload', () => {
    manager.dispose();
  });
}
```

## Summary

Dockview provides a production-ready solution for building complex, customizable layouts in web applications. The main use cases include code editors with split views and tabbed panels, data dashboards with resizable widgets, IDE-like interfaces with dockable tool windows, multi-document interfaces with state persistence, and collaborative applications requiring flexible workspace arrangements. The library excels in scenarios requiring drag-and-drop panel management, floating windows, popout support for multi-monitor setups, and full keyboard navigation.

Integration follows consistent patterns across all frameworks: initialize the component with a container element and configuration options, define component factories for rendering panel content and tabs, add panels programmatically or let users rearrange them via drag-and-drop, subscribe to events for synchronizing application state, serialize layouts for persistence across sessions, and properly dispose resources on cleanup. The framework-agnostic core ensures that migration between frameworks requires only updating the wrapper layer while maintaining the same layout logic, serialization format, and behavior across React, Vue, Angular, and vanilla TypeScript implementations.