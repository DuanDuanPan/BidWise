import { describe, it, expect } from 'vitest'
import type { SkeletonSection } from '@shared/template-types'
import {
  countTreeNodes,
  skeletonToTreeNodes,
  treeNodesToSkeleton,
} from '@modules/structure-design/adapters/skeletonAdapter'
import { renameNode, addSibling } from '@modules/structure-design/lib/draftMutations'

describe('@story-11-9 skeletonAdapter', () => {
  const sample: SkeletonSection[] = [
    {
      id: 'root-1',
      title: '项目概述',
      level: 1,
      isKeyFocus: false,
      weightPercent: 10,
      children: [
        {
          id: 'c-1',
          title: '项目背景',
          level: 2,
          isKeyFocus: true,
          children: [],
          guidanceText: '背景说明',
        },
      ],
      templateSectionKey: 's.root',
      guidanceText: '根章节说明',
    },
    {
      id: 'root-2',
      title: '系统架构',
      level: 1,
      isKeyFocus: true,
      weightPercent: 30,
      children: [],
    },
  ]

  it('maps every public field on the way out and back again', () => {
    const tree = skeletonToTreeNodes(sample)
    expect(tree[0].key).toBe('root-1')
    expect(tree[0].level).toBe(1)
    expect(tree[0].isKeyFocus).toBe(false)
    expect(tree[0].weightPercent).toBe(10)
    expect(tree[0].templateSectionKey).toBe('s.root')
    expect(tree[0].children[0].isKeyFocus).toBe(true)

    const back = treeNodesToSkeleton(tree)
    expect(back).toEqual(sample)
  })

  it('preserves guidanceText via sidecar through round-trip', () => {
    const tree = skeletonToTreeNodes(sample)
    const back = treeNodesToSkeleton(tree)
    expect(back[0].guidanceText).toBe('根章节说明')
    expect(back[0].children[0].guidanceText).toBe('背景说明')
  })

  it('countTreeNodes returns total + keyFocus identical to legacy helper', () => {
    const tree = skeletonToTreeNodes(sample)
    expect(countTreeNodes(tree)).toEqual({ total: 3, keyFocus: 2 })
  })

  it('treeNodesToSkeleton clamps level >4 down to 4 (draft safety)', () => {
    const widened = skeletonToTreeNodes(sample).map((n) => ({
      ...n,
      level: 6 as const,
    }))
    const back = treeNodesToSkeleton(widened)
    for (const s of back) {
      expect(s.level).toBe(4)
    }
  })

  it('preserves scoring* + guidanceText across draft mutations (rename + add sibling)', () => {
    // Regression: pre-fix `cloneTree({...n})` broke the WeakMap sidecar and
    // scoring* fields were never mapped onto StructureTreeNode. Any mutation
    // round-trip silently dropped them before templatePersistSkeleton.
    const richSample: SkeletonSection[] = [
      {
        id: 's-1',
        title: '技术方案',
        level: 1,
        isKeyFocus: true,
        weightPercent: 20,
        children: [],
        templateSectionKey: 's.1',
        guidanceText: '方案要点',
        scoringCriterionId: 'crit-1',
        scoringCriterionName: '技术评分',
        scoringSubItemId: 'sub-1',
        scoringSubItemName: '架构合理性',
      },
    ]
    const tree = skeletonToTreeNodes(richSample)
    const renamed = renameNode(tree, 's-1', '技术方案（改）')!
    const added = addSibling(renamed.nextNodes, 's-1', 4)!
    const back = treeNodesToSkeleton(added.nextNodes)
    const target = back.find((s) => s.id === 's-1')!
    expect(target.title).toBe('技术方案（改）')
    expect(target.guidanceText).toBe('方案要点')
    expect(target.scoringCriterionId).toBe('crit-1')
    expect(target.scoringCriterionName).toBe('技术评分')
    expect(target.scoringSubItemId).toBe('sub-1')
    expect(target.scoringSubItemName).toBe('架构合理性')
    // The newly-added sibling carries no sidecar, so must stay scoring-free.
    const fresh = back.find((s) => s.id !== 's-1')!
    expect(fresh.scoringCriterionId).toBeUndefined()
    expect(fresh.guidanceText).toBeUndefined()
  })
})
