import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ProjectDetailLayoutFrame } from './projects/$projectId'

describe('project detail route layout', () => {
  it('renders nested child content so work-item detail routes can replace the project board', () => {
    const html = renderToStaticMarkup(
      <ProjectDetailLayoutFrame>
        <div data-work-item-detail>detail</div>
      </ProjectDetailLayoutFrame>,
    )

    expect(html).toContain('data-project-detail-layout')
    expect(html).toContain('data-work-item-detail')
    expect(html).toContain('detail')
  })
})
