(function () {
    class EventManager {
        constructor(options = {}) {
            this.apiUrl = options.apiUrl || 'http://127.0.0.1:5000';
            this.onEventsChanged = options.onEventsChanged || (() => {});
            this.eventTypes = [];
            this.currentEventId = null;
            this.mode = 'create';
            this.flatpickrInstances = {};
            this.typeChoices = null;
            this.urgencyChoices = null;
            this.repeatTypeChoices = null;
            this.urgencyOptions = [
                '紧急且重要',
                '不紧急且重要',
                '紧急且不重要',
                '不紧急且不重要'
            ];
            this.initialized = false;
            this.calendarRef = null;
            this.pendingDelete = null;
            this.ready = this._init();
        }

        async _init() {
            try {
                await this._loadTemplate();
                this._cacheElements();
                this._bindBaseEvents();
                this._initPickers();
                this._initChoices();
                this._populateTypeSelect('');
                this._setUrgencyValue('');
                this._setRepeatTypeValue('daily');
                await this._loadEventTypes();
                this.initialized = true;
                document.dispatchEvent(new CustomEvent('event-manager:ready', {
                    detail: { instance: this }
                }));
                return true;
            } catch (error) {
                console.error('[EventManager] 初始化失败:', error);
                throw error;
            }
        }

        async _loadTemplate() {
            const existingRoot = document.getElementById('event-manager');
            if (existingRoot) {
                this.root = existingRoot;
                return;
            }
            try {
                const response = await fetch('event-modal.html', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Failed to fetch template: ${response.status}`);
                }
                const html = await response.text();
                this._injectTemplate(html);
            } catch (error) {
                console.warn('[EventManager] 无法加载 event-modal.html，将使用内置模板。', error);
                this._injectTemplate(this._getFallbackTemplate());
            }
        }

        _injectTemplate(markup) {
            const container = document.createElement('div');
            container.innerHTML = markup.trim();
            document.body.appendChild(container);
            this.root = document.getElementById('event-manager');
            if (!this.root) {
                throw new Error('未找到事件管理模态根节点，可能是模板结构异常');
            }
        }

        _getFallbackTemplate() {
            return `
<div id="event-manager">
    <div id="event-modal" class="modal hidden">
        <div class="modal-content modal-event">
            <div class="modal-header">
                <div class="modal-title">
                    <span class="modal-icon">📝</span>
                    <div class="modal-heading">
                        <h2 id="event-modal-heading">创建新事件</h2>
                        <p id="event-modal-subtitle">安排具体的时间与类别</p>
                    </div>
                </div>
                <button type="button" class="close-button" id="event-modal-close" aria-label="关闭">&times;</button>
            </div>
            <div class="modal-body">
                <label class="modal-label" for="event-title">标题</label>
                <input type="text" id="event-title" placeholder="请输入事件标题...">

                <div class="modal-field-grid">
                    <div class="modal-field">
                        <label class="modal-label" for="event-date">日期</label>
                        <input type="text" id="event-date" class="modal-datepicker" placeholder="选择日期">
                    </div>
                    <div class="modal-field">
                        <label class="modal-label" for="event-start-time">开始时间</label>
                        <input type="text" id="event-start-time" class="modal-timepicker" placeholder="09:00">
                    </div>
                    <div class="modal-field">
                        <label class="modal-label" for="event-end-time">结束时间</label>
                        <input type="text" id="event-end-time" class="modal-timepicker" placeholder="10:00">
                    </div>
                </div>

                <div class="modal-field-grid modal-field-grid--meta">
                    <div class="modal-field">
                        <label class="modal-label" for="event-type-select">事件类型</label>
                        <select id="event-type-select">
                            <option value="" disabled hidden>请选择事件类型</option>
                        </select>
                    </div>
                    <div class="modal-field">
                        <label class="modal-label" for="event-urgency">紧急程度</label>
                        <select id="event-urgency">
                            <option value="" disabled hidden>请选择紧急程度</option>
                            <option value="紧急且重要">紧急且重要</option>
                            <option value="不紧急且重要">不紧急且重要</option>
                            <option value="紧急且不重要">紧急且不重要</option>
                            <option value="不紧急且不重要">不紧急且不重要</option>
                        </select>
                    </div>
                </div>

                <div class="modal-field modal-field--textarea">
                    <label class="modal-label" for="event-remark">备注</label>
                    <textarea id="event-remark" class="modal-textarea" rows="2" maxlength="240" placeholder="补充说明、准备事项等..."></textarea>
                    <span class="modal-hint">最多两行，超出将出现滚动条</span>
                </div>

                <div class="modal-section">
                    <div class="toggle-row">
                        <span class="toggle-text">重复事件</span>
                        <label class="toggle">
                            <input type="checkbox" id="event-repeat-toggle">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div id="repeat-settings" class="repeat-settings hidden">
                        <div class="modal-field-grid modal-field-grid--meta">
                            <div class="modal-field">
                                <label class="modal-label" for="event-repeat-type">重复类型</label>
                                <select id="event-repeat-type">
                                    <option value="daily">每天</option>
                                    <option value="workday">中国大陆法定非节假日</option>
                                    <option value="holiday">中国大陆法定节假日</option>
                                    <option value="weekday">周一至周五</option>
                                    <option value="weekend">周末</option>
                                </select>
                            </div>
                            <div class="modal-field">
                                <label class="modal-label">重复结束</label>
                                <div class="repeat-end-options">
                                    <label><input type="radio" name="repeat-end" value="never" checked> 永久</label>
                                    <label><input type="radio" name="repeat-end" value="date"> 指定日期</label>
                                    <input type="text" id="event-repeat-end" class="modal-datepicker" placeholder="选择结束日期" disabled>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-actions modal-actions--multi">
                <button type="button" class="btn-secondary" id="event-modal-cancel">取消</button>
                <button type="button" class="btn-primary" id="save-event">保存事件</button>
            </div>
        </div>
    </div>

    <div id="event-complete-modal" class="modal hidden completion-modal">
        <div class="modal-content modal-complete">
            <div class="modal-header">
                <div class="modal-title">
                    <span class="modal-icon">✅</span>
                    <h3>完成事件</h3>
                </div>
                <button type="button" class="close-button" id="event-complete-close" aria-label="关闭">&times;</button>
            </div>
            <div class="modal-body">
                <p id="complete-event-title">请评价本次事件完成效率。</p>
                <label class="modal-label" for="complete-efficiency">效率评分</label>
                <select id="complete-efficiency">
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                </select>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" id="complete-cancel">暂不完成</button>
                <button type="button" class="btn-primary" id="complete-confirm">确认完成</button>
            </div>
        </div>
    </div>

    <div id="delete-confirm-modal" class="modal hidden">
        <div class="modal-content modal-delete-confirm">
            <div class="modal-header">
                <div class="modal-title">
                    <span class="modal-icon">⚠️</span>
                    <h3 id="delete-confirm-title">删除事件</h3>
                </div>
                <button type="button" class="close-button" id="delete-confirm-close" aria-label="关闭">&times;</button>
            </div>
            <div class="modal-body">
                <p id="delete-confirm-message" class="delete-message"></p>
                <div id="delete-options" class="delete-options hidden">
                    <label class="delete-option-item">
                        <input type="radio" name="delete-scope" value="single" checked>
                        <span class="option-content">
                            <strong>仅删除当前事件</strong>
                            <small>只删除这一次事件</small>
                        </span>
                    </label>
                    <label class="delete-option-item">
                        <input type="radio" name="delete-scope" value="all">
                        <span class="option-content">
                            <strong>删除所有重复事件</strong>
                            <small>删除这个系列的所有事件</small>
                        </span>
                    </label>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" id="delete-confirm-cancel">取消</button>
                <button type="button" class="btn-danger" id="delete-confirm-ok">确认删除</button>
            </div>
        </div>
    </div>
</div>`;
        }

        _cacheElements() {
            this.modal = document.getElementById('event-modal');
            this.modalHeading = document.getElementById('event-modal-heading');
            this.modalSubtitle = document.getElementById('event-modal-subtitle');
            this.closeButton = document.getElementById('event-modal-close');
            this.cancelButton = document.getElementById('event-modal-cancel');
            this.saveButton = document.getElementById('save-event');
            this.deleteButton = document.getElementById('delete-event');

            this.titleInput = document.getElementById('event-title');
            this.dateInput = document.getElementById('event-date');
            this.startTimeInput = document.getElementById('event-start-time');
            this.endTimeInput = document.getElementById('event-end-time');
            this.allDayCheckbox = document.getElementById('event-all-day');
            this.typeSelect = document.getElementById('event-type-select');
            this.urgencySelect = document.getElementById('event-urgency');
            this.remarkInput = document.getElementById('event-remark');

            this.repeatToggle = document.getElementById('event-repeat-toggle');
            this.repeatSettings = document.getElementById('repeat-settings');
            this.repeatTypeSelect = document.getElementById('event-repeat-type');
            this.repeatEndRadios = Array.from(document.querySelectorAll('input[name="repeat-end"]'));
            this.repeatEndInput = document.getElementById('event-repeat-end');

            this.completeModal = document.getElementById('event-complete-modal');
            this.completeTitle = document.getElementById('complete-event-title');
            this.completeEfficiency = document.getElementById('complete-efficiency');
            this.completeCloseButton = document.getElementById('event-complete-close');
            this.completeConfirm = document.getElementById('complete-confirm');
            this.completeCancel = document.getElementById('complete-cancel');
            this.completeEfficiencyChoices = null;

            this.deleteConfirmModal = document.getElementById('delete-confirm-modal');
            this.deleteConfirmTitle = document.getElementById('delete-confirm-title');
            this.deleteConfirmMessage = document.getElementById('delete-confirm-message');
            this.deleteOptions = document.getElementById('delete-options');
            this.deleteConfirmClose = document.getElementById('delete-confirm-close');
            this.deleteConfirmOk = document.getElementById('delete-confirm-ok');
            this.deleteConfirmCancel = document.getElementById('delete-confirm-cancel');
            this.deleteScopeRadios = Array.from(document.querySelectorAll('input[name="delete-scope"]'));
        }

        _bindBaseEvents() {
            this.closeButton.addEventListener('click', () => this.closeModal());
            this.cancelButton.addEventListener('click', () => this.closeModal());
            this.saveButton.addEventListener('click', () => this._handleSave());

            this.repeatToggle.addEventListener('change', () => {
                if (this.repeatToggle.checked) {
                    this.repeatSettings.classList.remove('hidden');
                } else {
                    this.repeatSettings.classList.add('hidden');
                }
            });

            this.allDayCheckbox.addEventListener('change', () => {
                const isAllDay = this.allDayCheckbox.checked;
                this.startTimeInput.disabled = isAllDay;
                this.endTimeInput.disabled = isAllDay;
                if (isAllDay) {
                    if (this.flatpickrInstances.start) {
                        this.flatpickrInstances.start.clear();
                    }
                    if (this.flatpickrInstances.end) {
                        this.flatpickrInstances.end.clear();
                    }
                }
            });

            this.repeatEndRadios.forEach(radio => {
                radio.addEventListener('change', () => {
                    const enableDate = this.repeatEndRadios.find(r => r.checked && r.value === 'date');
                    if (enableDate) {
                        this.repeatEndInput.removeAttribute('disabled');
                        if (this.flatpickrInstances.repeatEnd) {
                            this.flatpickrInstances.repeatEnd.open();
                        }
                    } else {
                        this.repeatEndInput.setAttribute('disabled', 'disabled');
                        if (this.flatpickrInstances.repeatEnd) {
                            this.flatpickrInstances.repeatEnd.clear();
                        }
                    }
                });
            });

            if (this.deleteButton) {
                this.deleteButton.addEventListener('click', () => {
                    this._handleDelete();
                });
            }

            this.completeCancel.addEventListener('click', () => {
                this._closeCompleteModal();
            });

            if (this.completeCloseButton) {
                this.completeCloseButton.addEventListener('click', () => {
                    this._closeCompleteModal();
                });
            }

            this.completeConfirm.addEventListener('click', () => {
                this._handleCompleteConfirm();
            });

            this.deleteConfirmClose.addEventListener('click', () => this._closeDeleteConfirm());
            this.deleteConfirmCancel.addEventListener('click', () => this._closeDeleteConfirm());
            this.deleteConfirmOk.addEventListener('click', () => this._confirmDelete());
        }

        _initPickers() {
            if (window.flatpickr) {
                if (flatpickr.l10ns && flatpickr.l10ns.zh) {
                    flatpickr.localize(flatpickr.l10ns.zh);
                }
                this.flatpickrInstances.date = flatpickr(this.dateInput, {
                    dateFormat: 'Y-m-d',
                    defaultDate: new Date(),
                    allowInput: false,
                    locale: { firstDayOfWeek: 1 }
                });
                const validateTimeNotBefore7 = (selectedDates, dateStr, instance) => {
                    if (!dateStr) return;
                    const [hours, minutes] = dateStr.split(':').map(Number);
                    // 允许 00:00 (通常作为结束时间)，但禁止 00:01 - 06:59
                    if (hours === 0 && minutes === 0) return;

                    if (hours < 7) {
                        instance.setDate('07:00', false);
                        alert('时间不得早于7:00 (00:00除外)');
                    }
                };
                const timeOptions = {
                    enableTime: true,
                    noCalendar: true,
                    dateFormat: 'H:i',
                    time_24hr: true,
                    minuteIncrement: 15,
                    allowInput: false,
                    minTime: '00:00',
                    maxTime: '23:59'
                };
                this.flatpickrInstances.start = flatpickr(this.startTimeInput, {
                    ...timeOptions,
                    defaultDate: '09:00',
                    onChange: validateTimeNotBefore7
                });
                this.flatpickrInstances.end = flatpickr(this.endTimeInput, {
                    ...timeOptions,
                    defaultDate: '10:00',
                    onChange: validateTimeNotBefore7
                });
                this.flatpickrInstances.repeatEnd = flatpickr(this.repeatEndInput, {
                    dateFormat: 'Y-m-d',
                    allowInput: false,
                    locale: { firstDayOfWeek: 1 }
                });
            }
        }

        _initChoices() {
            if (!window.Choices) {
                return;
            }
            const baseConfig = {
                searchEnabled: false,
                itemSelectText: '',
                shouldSort: false,
                position: 'bottom',
                allowHTML: false,
                removeItemButton: false,
                duplicateItemsAllowed: false
            };
            if (this.typeSelect) {
                this.typeChoices = new Choices(this.typeSelect, {
                    ...baseConfig,
                    placeholderValue: '请选择事件类型'
                });
            }
            if (this.urgencySelect) {
                this.urgencyChoices = new Choices(this.urgencySelect, baseConfig);
            }
            if (this.repeatTypeSelect) {
                this.repeatTypeChoices = new Choices(this.repeatTypeSelect, {
                    ...baseConfig,
                    placeholder: false
                });
            }
            if (this.completeEfficiency) {
                this.completeEfficiencyChoices = new Choices(this.completeEfficiency, {
                    ...baseConfig,
                    placeholder: false
                });
            }
        }

        async _loadEventTypes() {
            try {
                const response = await fetch(`${this.apiUrl}/event-types`);
                if (!response.ok) throw new Error('加载事件类型失败');
                this.eventTypes = await response.json();
                const selected = this._getSelectedTypeId();
                this._populateTypeSelect(selected);
                document.dispatchEvent(new CustomEvent('event-types:updated', { detail: this.eventTypes }));
            } catch (error) {
                console.error('[EventManager] 获取事件类型失败:', error);
                this.eventTypes = [];
                const selected = this._getSelectedTypeId();
                this._populateTypeSelect(selected);
                document.dispatchEvent(new CustomEvent('event-types:updated', { detail: this.eventTypes }));
            }
        }

        _populateTypeSelect(selectedValue = '') {
            if (!this.typeSelect) return;
            const normalizedSelected = selectedValue ? String(selectedValue) : '';
            const hasTypes = Array.isArray(this.eventTypes) && this.eventTypes.length > 0;
            const placeholderLabel = hasTypes ? '请选择事件类型' : '请先创建事件类型';

            const mappedChoices = hasTypes ? this.eventTypes.map((type) => {
                const value = String(type.id);
                return {
                    value,
                    label: type.name,
                    selected: value === normalizedSelected
                };
            }) : [];

            const selectedExists = mappedChoices.some(choice => choice.value === normalizedSelected);
            const extraChoice = (!selectedExists && normalizedSelected)
                ? [{ value: normalizedSelected, label: '历史类型（已删除）', selected: true }]
                : [];

            if (this.typeChoices) {
                // 更新占位符文本
                const placeholderOption = this.typeSelect.querySelector('option[value=""]');
                if (placeholderOption) {
                    placeholderOption.textContent = placeholderLabel;
                }
                
                // 只设置真实的选项,不包含占位符
                const choiceItems = mappedChoices.concat(extraChoice);
                this.typeChoices.clearChoices();
                this.typeChoices.setChoices(choiceItems, 'value', 'label', true);
                if (normalizedSelected && selectedExists) {
                    try {
                        this.typeChoices.setChoiceByValue(normalizedSelected);
                    } catch (error) {
                        this.typeChoices.removeActiveItems();
                        this.typeChoices.clearInput();
                    }
                } else if (!normalizedSelected) {
                    this.typeChoices.removeActiveItems();
                    this.typeChoices.clearInput();
                }
            } else {
                this.typeSelect.innerHTML = '';
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = placeholderLabel;
                defaultOption.disabled = true;
                defaultOption.selected = !normalizedSelected;
                this.typeSelect.appendChild(defaultOption);

                mappedChoices.forEach((choice) => {
                    const option = document.createElement('option');
                    option.value = choice.value;
                    option.textContent = choice.label;
                    if (choice.selected) {
                        option.selected = true;
                    }
                    this.typeSelect.appendChild(option);
                });

                if (extraChoice.length > 0) {
                    const legacyOption = document.createElement('option');
                    legacyOption.value = normalizedSelected;
                    legacyOption.textContent = '历史类型（已删除）';
                    legacyOption.selected = true;
                    this.typeSelect.appendChild(legacyOption);
                }
            }
        }

        _getSelectedTypeId() {
            if (this.typeChoices) {
                const value = this.typeChoices.getValue(true);
                const normalized = Array.isArray(value) ? value[0] : value;
                return normalized || '';
            }
            return this.typeSelect ? this.typeSelect.value : '';
        }

        _setUrgencyValue(value = '') {
            const normalizedValue = value !== undefined && value !== null ? String(value) : '';
            if (this.urgencyChoices) {
                const mappedChoices = this.urgencyOptions.map((option) => ({
                    value: option,
                    label: option,
                    selected: option === normalizedValue
                }));
                const extraChoice = (!this.urgencyOptions.includes(normalizedValue) && normalizedValue)
                    ? [{ value: normalizedValue, label: `${normalizedValue}（历史值）`, selected: true }]
                    : [];
                const choices = mappedChoices.concat(extraChoice);
                this.urgencyChoices.clearChoices();
                this.urgencyChoices.setChoices(choices, 'value', 'label', true);
                if (normalizedValue) {
                    try {
                        this.urgencyChoices.setChoiceByValue(normalizedValue);
                    } catch (error) {
                        // 忽略因历史值导致的选择异常
                    }
                } else {
                    this.urgencyChoices.removeActiveItems();
                    this.urgencyChoices.clearInput();
                }
            } else if (this.urgencySelect) {
                const select = this.urgencySelect;
                Array.from(select.querySelectorAll('option[data-legacy="true"]')).forEach((option) => option.remove());
                let placeholder = select.querySelector('option[value=""]');
                if (!placeholder) {
                    placeholder = document.createElement('option');
                    placeholder.value = '';
                    placeholder.disabled = true;
                    select.insertBefore(placeholder, select.firstChild);
                }
                placeholder.textContent = '请选择紧急程度';
                placeholder.disabled = true;
                placeholder.selected = !normalizedValue;

                this.urgencyOptions.forEach((optionValue) => {
                    let option = select.querySelector(`option[value="${optionValue}"]`);
                    if (!option) {
                        option = document.createElement('option');
                        option.value = optionValue;
                        option.textContent = optionValue;
                        select.appendChild(option);
                    }
                });

                if (normalizedValue && !this.urgencyOptions.includes(normalizedValue)) {
                    const legacyOption = document.createElement('option');
                    legacyOption.value = normalizedValue;
                    legacyOption.textContent = `${normalizedValue}（历史值）`;
                    legacyOption.dataset.legacy = 'true';
                    select.appendChild(legacyOption);
                }

                select.value = normalizedValue;
            }
        }

        _getSelectedUrgency() {
            if (this.urgencyChoices) {
                const value = this.urgencyChoices.getValue(true);
                const normalized = Array.isArray(value) ? value[0] : value;
                return normalized || '';
            }
            return this.urgencySelect ? this.urgencySelect.value : '';
        }

        _setRepeatTypeValue(value = 'daily') {
            const targetValue = value || 'daily';
            if (this.repeatTypeChoices) {
                try {
                    this.repeatTypeChoices.setChoiceByValue(targetValue);
                } catch (error) {
                    this.repeatTypeChoices.removeActiveItems();
                    this.repeatTypeChoices.clearInput();
                }
            } else if (this.repeatTypeSelect) {
                this.repeatTypeSelect.value = targetValue;
            }
        }

        _getRepeatTypeValue() {
            if (this.repeatTypeChoices) {
                const value = this.repeatTypeChoices.getValue(true);
                const normalized = Array.isArray(value) ? value[0] : value;
                return normalized || 'daily';
            }
            return this.repeatTypeSelect ? (this.repeatTypeSelect.value || 'daily') : 'daily';
        }

        async _handleSave() {
            if (this.saveButton.disabled) return;

            const originalText = this.saveButton.textContent;
            this.saveButton.disabled = true;
            this.saveButton.textContent = '保存中...';

            try {
                const payload = this._collectFormData();
                let response;
                if (this.mode === 'edit' && this.currentEventId) {
                    response = await fetch(`${this.apiUrl}/events/${this.currentEventId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    response = await fetch(`${this.apiUrl}/events`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }
                if (!response.ok) {
                    const message = await response.text();
                    throw new Error(message || '保存事件失败');
                }
                this.closeModal();
                this.onEventsChanged();
                document.dispatchEvent(new CustomEvent('events:changed'));
            } catch (error) {
                console.error('[EventManager] 保存事件失败:', error);
                alert(error.message || '保存事件失败，请检查填写内容');
                this.saveButton.disabled = false;
                this.saveButton.textContent = originalText;
            }
        }

        _handleDelete() {
            if (this.mode !== 'edit' || !this.currentEventId) {
                return;
            }
            const title = this.titleInput.value.trim();
            this._showDeleteConfirm({
                id: this.currentEventId,
                title,
                isRepeat: this.repeatToggle.checked,
                fromModal: true
            });
        }

        _showDeleteConfirm({ id, title = '', isRepeat = false, fromModal = false }) {
            if (!id) {
                return;
            }

            const displayTitle = title || '该事件';
            this.pendingDelete = {
                id,
                title: displayTitle,
                isRepeat: !!isRepeat,
                fromModal
            };

            if (isRepeat) {
                this.deleteConfirmMessage.textContent = `这是一个重复事件「${displayTitle}」，请选择删除范围：`;
                this.deleteOptions.classList.remove('hidden');
                if (this.deleteScopeRadios && this.deleteScopeRadios.length > 0) {
                    this.deleteScopeRadios.forEach((radio) => {
                        radio.checked = radio.value === 'single';
                    });
                }
            } else {
                this.deleteConfirmMessage.textContent = `确认删除事件「${displayTitle}」？删除后无法恢复。`;
                this.deleteOptions.classList.add('hidden');
            }

            this.deleteConfirmModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        _closeDeleteConfirm(preservePending = false) {
            this.deleteConfirmModal.classList.add('hidden');
            document.body.style.overflow = '';
            if (!preservePending) {
                this.pendingDelete = null;
            }
        }

        async _confirmDelete() {
            if (!this.pendingDelete) {
                this._closeDeleteConfirm();
                return;
            }
            const pending = this.pendingDelete;
            const { id, isRepeat, fromModal } = pending;
            let deleteAll = false;

            if (isRepeat && this.deleteScopeRadios) {
                const selected = this.deleteScopeRadios.find((radio) => radio.checked);
                deleteAll = !!(selected && selected.value === 'all');
            }

            this._closeDeleteConfirm(true);

            try {
                if (fromModal && this.deleteButton) {
                    this.deleteButton.disabled = true;
                }
                const url = deleteAll
                    ? `${this.apiUrl}/events/${id}?deleteAll=true`
                    : `${this.apiUrl}/events/${id}`;

                const response = await fetch(url, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    const message = await response.text();
                    throw new Error(message || '删除事件失败');
                }
                if (fromModal) {
                    this.closeModal();
                }
                this.onEventsChanged();
                document.dispatchEvent(new CustomEvent('events:changed'));
            } catch (error) {
                console.error('[EventManager] 删除事件失败:', error);
                alert(error.message || '删除事件失败，请稍后重试');
            } finally {
                if (fromModal && this.deleteButton) {
                    this.deleteButton.disabled = false;
                }
                this.pendingDelete = null;
            }
        }

        _collectFormData() {
            const title = this.titleInput.value.trim();
            if (!title) {
                throw new Error('请填写事件标题');
            }
            const date = this.dateInput.value;
            const isAllDay = this.allDayCheckbox.checked;
            const startTime = isAllDay ? '' : this.startTimeInput.value;
            const endTime = isAllDay ? '' : this.endTimeInput.value;
            
            if (!date) {
                throw new Error('请选择日期');
            }
            if (!isAllDay && (!startTime || !endTime)) {
                throw new Error('请完善日期与时间');
            }
            
            let startDateTime, endDateTime;
            if (isAllDay) {
                startDateTime = `${date}T00:00`;
                endDateTime = `${date}T23:59`;
            } else {
                startDateTime = `${date}T${startTime}`;
                
                if (endTime === '00:00') {
                    // 特殊处理：00:00 视为次日零点
                    const d = new Date(date + 'T00:00:00');
                    d.setDate(d.getDate() + 1);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    endDateTime = `${y}-${m}-${day}T00:00`;
                } else {
                    endDateTime = `${date}T${endTime}`;
                }

                if (new Date(endDateTime) <= new Date(startDateTime)) {
                    throw new Error('结束时间必须晚于开始时间');
                }
            }

            const typeId = this._getSelectedTypeId();
            if (!typeId) {
                throw new Error('请选择事件类型');
            }
            const type = this.eventTypes.find(t => String(t.id) === String(typeId));
            const urgency = this._getSelectedUrgency();
            if (!urgency) {
                throw new Error('请选择紧急程度');
            }

            const remarkRaw = this.remarkInput ? this.remarkInput.value.replace(/\r\n/g, '\n') : '';
            const remarkTrimmed = remarkRaw.trim();
            const normalizedRemark = remarkTrimmed ? remarkTrimmed.slice(0, 240) : '';

            const payload = {
                title,
                start: startDateTime,
                end: endDateTime,
                allDay: isAllDay,
                category: type ? type.name : '默认',
                customTypeId: type ? type.id : typeId,
                urgency,
                remark: normalizedRemark || null
            };
            
            if (!isAllDay) {
                payload.time = `${startTime} - ${endTime}`;
            }

            if (this.repeatToggle.checked) {
                const repeatType = this._getRepeatTypeValue();
                const endOption = this.repeatEndRadios.find(r => r.checked)?.value || 'never';
                let repeatEndDate = null;
                if (endOption === 'date') {
                    if (!this.repeatEndInput.value) {
                        throw new Error('请选择重复结束日期');
                    }
                    repeatEndDate = this.repeatEndInput.value;
                }
                payload.isRepeat = true;
                payload.repeatType = repeatType;
                payload.repeatEndDate = repeatEndDate;
            } else {
                payload.isRepeat = false;
            }

            return payload;
        }

        openForCreate(defaults = {}) {
            if (!this.initialized) return;
            this.mode = 'create';
            this.currentEventId = null;
            this.modalHeading.textContent = '创建新事件';
            if (this.modalSubtitle) {
                this.modalSubtitle.textContent = '安排具体的时间与类别';
            }
            if (this.deleteButton) {
                this.deleteButton.classList.add('hidden');
            }
            this._resetForm(defaults);
            this.modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        openForEdit(eventData) {
            if (!this.initialized || !eventData) return;
            this.mode = 'edit';
            this.currentEventId = eventData.id;
            this.modalHeading.textContent = '编辑事件';
            if (this.modalSubtitle) {
                this.modalSubtitle.textContent = '更新事件信息，必要时可以删除';
            }
            if (this.deleteButton) {
                this.deleteButton.classList.remove('hidden');
                this.deleteButton.disabled = false;
            }
            this._resetForm({
                title: eventData.title,
                date: eventData.start?.slice(0, 10),
                allDay: eventData.allDay || false,
                startTime: eventData.start?.slice(11, 16),
                endTime: eventData.end?.slice(11, 16),
                customTypeId: eventData.customTypeId,
                urgency: eventData.urgency || '',
                isRepeat: eventData.isRepeat,
                repeatType: eventData.repeatType,
                repeatEndDate: eventData.repeatEndDate?.slice(0, 10),
                remark: eventData.remark || ''
            });
            this.modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        openForCopy(eventData) {
            if (!this.initialized || !eventData) return;
            this.mode = 'create';
            this.currentEventId = null;
            this.modalHeading.textContent = '复制事件';
            if (this.modalSubtitle) {
                this.modalSubtitle.textContent = '创建一条新的事件副本';
            }
            if (this.deleteButton) {
                this.deleteButton.classList.add('hidden');
                this.deleteButton.disabled = false;
            }
            this._resetForm({
                title: eventData.title ? `${eventData.title} (复制)` : '',
                date: eventData.start?.slice(0, 10),
                allDay: eventData.allDay || false,
                startTime: eventData.start?.slice(11, 16),
                endTime: eventData.end?.slice(11, 16),
                customTypeId: eventData.customTypeId,
                urgency: eventData.urgency || '',
                isRepeat: eventData.isRepeat,
                repeatType: eventData.repeatType,
                repeatEndDate: eventData.repeatEndDate?.slice(0, 10),
                remark: eventData.remark || ''
            });
            this.modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        openDeleteConfirm(eventData) {
            if (!this.initialized || !eventData) return;
            this._showDeleteConfirm({
                id: eventData.id,
                title: eventData.title,
                isRepeat: eventData.isRepeat,
                fromModal: false
            });
        }

        _resetForm(defaults = {}) {
            this.titleInput.value = defaults.title || '';
            if (this.flatpickrInstances.date) {
                this.flatpickrInstances.date.setDate(defaults.date || new Date(), true);
            } else {
                this.dateInput.value = defaults.date || '';
            }
            
            const isAllDay = defaults.allDay || false;
            this.allDayCheckbox.checked = isAllDay;
            this.startTimeInput.disabled = isAllDay;
            this.endTimeInput.disabled = isAllDay;
            
            if (isAllDay) {
                if (this.flatpickrInstances.start) {
                    this.flatpickrInstances.start.clear();
                }
                if (this.flatpickrInstances.end) {
                    this.flatpickrInstances.end.clear();
                }
            } else {
                if (this.flatpickrInstances.start) {
                    this.flatpickrInstances.start.setDate(defaults.startTime || '09:00', true, 'H:i');
                } else {
                    this.startTimeInput.value = defaults.startTime || '';
                }
                if (this.flatpickrInstances.end) {
                    this.flatpickrInstances.end.setDate(defaults.endTime || '10:00', true, 'H:i');
                } else {
                    this.endTimeInput.value = defaults.endTime || '';
                }
            }
            
            const typeId = defaults.customTypeId !== undefined && defaults.customTypeId !== null
                ? String(defaults.customTypeId)
                : '';
            this._populateTypeSelect(typeId);
            const urgencyValue = defaults.urgency ?? '';
            this._setUrgencyValue(urgencyValue);

            if (this.remarkInput) {
                this.remarkInput.value = defaults.remark ? String(defaults.remark) : '';
            }

            const isRepeat = !!defaults.isRepeat;
            this.repeatToggle.checked = isRepeat;
            if (isRepeat) {
                this.repeatSettings.classList.remove('hidden');
            } else {
                this.repeatSettings.classList.add('hidden');
            }
            const repeatType = defaults.repeatType ?? 'daily';
            this._setRepeatTypeValue(repeatType);
            if (defaults.repeatEndDate) {
                this.repeatEndRadios.forEach(r => {
                    r.checked = r.value === 'date';
                });
                this.repeatEndInput.removeAttribute('disabled');
                if (this.flatpickrInstances.repeatEnd) {
                    this.flatpickrInstances.repeatEnd.setDate(defaults.repeatEndDate, true);
                } else {
                    this.repeatEndInput.value = defaults.repeatEndDate;
                }
            } else {
                this.repeatEndRadios.forEach(r => {
                    r.checked = r.value === 'never';
                });
                this.repeatEndInput.setAttribute('disabled', 'disabled');
                if (this.flatpickrInstances.repeatEnd) {
                    this.flatpickrInstances.repeatEnd.clear();
                } else {
                    this.repeatEndInput.value = '';
                }
            }
        }

        closeModal() {
            this.modal.classList.add('hidden');
            document.body.style.overflow = '';
            this.mode = 'create';
            this.currentEventId = null;
            if (this.saveButton) {
                this.saveButton.disabled = false;
                this.saveButton.textContent = '保存事件';
            }
            if (this.deleteButton) {
                this.deleteButton.classList.add('hidden');
                this.deleteButton.disabled = false;
            }
            if (this.modalSubtitle) {
                this.modalSubtitle.textContent = '安排具体的时间与类别';
            }
            this._resetForm();
        }

        openCompleteModal(eventData) {
            if (!eventData) return;
            this.completingEvent = eventData;
            this.completeTitle.textContent = `确认完成事件：「${eventData.title}」？`;
            if (this.completeEfficiencyChoices) {
                this.completeEfficiencyChoices.setChoiceByValue('high');
            } else {
                this.completeEfficiency.value = 'high';
            }
            this.completeModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }

        async _handleCompleteConfirm() {
            if (!this.completingEvent) {
                this.completeModal.classList.add('hidden');
                return;
            }
            try {
                const efficiencyValue = this.completeEfficiencyChoices 
                    ? this.completeEfficiencyChoices.getValue(true)
                    : this.completeEfficiency.value;
                const response = await fetch(`${this.apiUrl}/events/${this.completingEvent.id}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ efficiency: efficiencyValue })
                });
                if (!response.ok) {
                    const message = await response.text();
                    throw new Error(message || '完成事件失败');
                }
                this._closeCompleteModal();
                this.onEventsChanged();
                document.dispatchEvent(new CustomEvent('events:changed'));
            } catch (error) {
                console.error('[EventManager] 完成事件失败:', error);
                alert(error.message || '完成事件失败，请稍后重试');
            }
        }

        _closeCompleteModal() {
            this.completeModal.classList.add('hidden');
            document.body.style.overflow = '';
            this.completingEvent = null;
        }

        attachTrigger(selector) {
            const trigger = document.querySelector(selector);
            if (trigger) {
                trigger.addEventListener('click', () => this.openForCreate());
            }
        }

        setCalendarRef(callback) {
            this.onEventsChanged = callback || (() => {});
        }

        getTypeById(id) {
            return this.eventTypes.find(type => type.id === id);
        }

        async refreshTypes() {
            await this._loadEventTypes();
        }
    }

    window.EventManager = EventManager;
})();
