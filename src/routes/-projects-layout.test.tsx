import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ProjectsLayoutFrame } from './projects'

describe('projects route layout', () => {
  it('renders nested child content so project detail routes can replace the projects list', () => {
    const html = renderToStaticMarkup(
      <ProjectsLayoutFrame>
        <div data-project-detail>detail</div>
      </ProjectsLayoutFrame>,
    )

    expect(html).toContain('data-projects-layout')
    expect(html).toContain('data-project-detail')
    expect(html).toContain('detail')
  })
})
