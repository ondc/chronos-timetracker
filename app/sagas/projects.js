// @flow
import { put, call, select, takeLatest, take } from 'redux-saga/effects';
import Raven from 'raven-js';
import normalizePayload from 'normalize-util';

import { types, projectsActions, issuesActions } from 'actions';
import { getSelectedBoardId } from 'selectors';
import * as Api from 'api';

import { setToStorage, getFromStorage } from './storage';

import { throwError, notify } from './ui';

import type { SelectProjectAction, Id, ProjectType } from '../types';

export function* fetchProjects(): Generator<*, *, *> {
  try {
    yield put(projectsActions.setProjectsFetching(true));
    const projects = yield call(Api.fetchProjects);
    const boards = yield call(Api.fetchAllBoards);
    const normalizedBoards = yield call(normalizePayload, boards.values, 'boards');
    const normalizedProjects = yield call(normalizePayload, projects, 'projects');
    const { scrumBoards, kanbanBoards } = normalizedBoards.ids.reduce(
      (filter, id) => (
        normalizedBoards.map[id].type === 'scrum'
          ? filter.scrumBoards.push(id)
          : filter.kanbanBoards.push(id)
      ) && filter,
      { scrumBoards: [], kanbanBoards: [] },
    );
    yield put(projectsActions.fillProjects(normalizedProjects));
    yield put(projectsActions.fillBoards(normalizedBoards, scrumBoards, kanbanBoards));
    const lastProjectSelected: Id | null = yield call(getFromStorage, 'lastProjectSelected');
    const lastProjectSelectedType: ProjectType | null = yield call(getFromStorage, 'lastProjectSelectedType');
    if (lastProjectSelected) {
      yield put(projectsActions.selectProject(lastProjectSelected, lastProjectSelectedType || 'project'));
      yield put(issuesActions.fetchIssuesRequest());
    }
    yield put(projectsActions.setProjectsFetching(false));
  } catch (err) {
    yield call(notify, '', 'Failed to load projects, check your permissions');
    yield put(projectsActions.setProjectsFetching(false));
    yield call(throwError, err);
    Raven.captureException(err);
  }
}

export function* watchFetchProjectsRequest(): Generator<*, *, *> {
  yield takeLatest(types.FETCH_PROJECTS_REQUEST, fetchProjects);
}

export function* fetchSprints(): Generator<*, *, *> {
  try {
    // yield put({ type: types.SET_SPRINTS_FOR_BOARD_FETCH_STATE, payload: true });
    const selectedBoardId = yield select(getSelectedBoardId);
    const sprints = yield call(fetchSprints, { selectedBoardId });
    const normalizedSprints = normalizePayload(sprints, 'sprints');
    yield put(projectsActions.fillSprints(normalizedSprints));
    // yield put({ type: types.SET_SPRINTS_FOR_BOARD_FETCH_STATE, payload: false });
  } catch (err) {
    yield call(throwError, err);
    Raven.captureException(err);
  }
}

export function* watchFetchSprintsRequest(): Generator<*, *, *> {
  yield takeLatest(types.FETCH_SPRINTS_REQUEST, fetchSprints);
}

export function* watchProjectSelection(): Generator<*, *, *> {
  while (true) {
    const { payload, meta }: SelectProjectAction = yield take(types.SELECT_PROJECT);
    yield call(setToStorage, 'lastProjectSelected', payload);
    yield call(setToStorage, 'lastProjectSelectedType', meta);
    yield put(issuesActions.selectIssue(null));
    yield put(issuesActions.clearIssues());
    yield put(issuesActions.fetchIssuesRequest());
  }
}
