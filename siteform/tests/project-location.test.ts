import test from 'node:test'
import assert from 'node:assert/strict'
import {blankProject,siteLocation} from '../src/project.ts'
import {geographicPoint} from '../src/geography.ts'

test('the site location is derived from the redline centroid in either winding',()=>{
  const project=blankProject()
  assert.equal(siteLocation(project),undefined)
  const boundary:[[number,number],[number,number],[number,number]]=[[30,60],[60,60],[30,90]]
  const expected=geographicPoint(project.anchor!,40,70)
  assert.deepEqual(siteLocation({...project,boundary}),expected)
  assert.deepEqual(siteLocation({...project,boundary:[...boundary].reverse()}),expected)
})
