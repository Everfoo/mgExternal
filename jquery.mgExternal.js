/**
 * mgExternal 1.0.19
 *
 * Copyright 2011 Ricard Osorio Mañanas
 * Dual licensed under the MIT or GPL Version 2 licenses.
 */

(function($, undefined){

$.fn.mgExternal = function(defaultContent, options) {
	return this.each(function(){
		$(this).data('mgExternal', mgExternal(this, defaultContent, options));
	});
};

window.mgExternal = function(trigger, defaultContent, options) {

	if (!(this instanceof mgExternal))
		return new mgExternal(trigger, defaultContent, options);

	// trigger is optional when used only once. Eg: mgExternal("Hi!");
	if (trigger.tagName === undefined) {
		options = defaultContent;
		defaultContent = trigger;
		trigger = null;
	}

	// No defaultContent is required, as long as settings.ajaxUrl is set
	// or an href attribute is provided
	if (typeof defaultContent == 'object') {
		options = defaultContent;
		defaultContent = null;
	}

	// Default settings
	this.settings = {

		// Core
		display: 'modal', // modal, tooltip or inline
		content: (options && options.display == 'inline') ? $(trigger) : $('<div/>'),
		auto: !trigger, // Auto-open, default false if a trigger exists
		renew: (options && options.tooltip && options.tooltip.bind == 'hover') ? false : true, // Should each call fetch new data
		autoFocus: true, // Auto-focus first input element
		outsideClose: true, // Hide container when an outside click occurs
		escClose: true, // Hide container when the ESC key is pressed
		destroyOnClose: !trigger, // Destroy all generated elements and remove bindings

		// Appearance
		dataCss: {}, // Custom data CSS
		extraClass: (options && options.display) ? (options.display != 'inline' ? options.display : null) : 'modal',
		showDelay: (options && options.display == 'tooltip' && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Show delay in ms
		hideDelay: (options && options.display == 'tooltip' && options.tooltip && options.tooltip.bind == 'hover') ? 200 : 0, // Hide delay in ms
		showSpeed: 300,
		hideSpeed: 300,
		overlayColor: '#fff',
		overlayOpacity: (!options || !options.display || options.display == 'modal') ? 0.7 : 0, // Opacity from 0 to 1
		submitIdentifier: 'input[type="submit"]',
		focusPriority: [
			':not(:radio):input:visible:enabled:first'
		],

		// Ajax
		ajaxUrl: null, // URL to fetch data from (if no defaultContent is provided or a form is sent)
		ajaxData: {},

		// Modal settings
		modal: {
			animateSpeed: 500
		},

		// Tooltip settings
		tooltip: {
			bind: 'click', // click, hover or focus
			position: 'top center', // top/bottom left/center/right, or left/right top/middle/bottom
			positionSource: $(trigger),
			distance: 0,
			arrowSize: 8, // Arrow size in pixels
			arrowDistance: 15,
			arrowFrontColor: null, // Default front color is set in the CSS file,
			arrowBorderColor: null, // Default border color is set in the CSS file,
			activeClass: 'active'
		},

		// Callbacks
		onCreateElements: function(){},
		onBeforeShow: function(){}, // returning false prevents opening
		onShow: function(){},
		onBeforeClose: function(){}, // returning false prevents closing
		onClose: function(){},
		onDestroy: function(){},
		onContentReady: function(){},
		onJsonData: function(data){}
	};

	// data-mg-external HTML attributes are a valid alternate method of
	// passing options
	$.extend(true, this.settings, this.defaults, options, $(trigger).data('mgExternal'));

	// Internal jQuery elements
	this.$trigger = $(trigger);
	this.$container = null;
	this.$data = null;
	this.$content = this.settings.content;
	this.$tooltipArrow = null;

	// Private vars
	this._defaultContent = defaultContent;
	this._defaultAjaxUrl = this.settings.ajaxUrl;
	this._lastSubmitName = null;
	this._show = false;
	this._triggerZIndexBackup = null;

	// Set trigger bindings
	if (this.$trigger) {
		var self = this;

		switch (this.settings.display) {

			case 'modal':
				this.$trigger.bind('click', function(e){
					self.open(self.settings.showDelay);
					e.preventDefault();
					e.stopPropagation();
				});
				break;

			case 'tooltip':
				switch (this.settings.tooltip.bind) {
					case 'click':
						this.$trigger.bind('click', function(e){
							self.isVisible() ? self.close() : self.open(self.settings.showDelay);
							e.preventDefault();
							e.stopPropagation();
						});
						break;
					case 'hover':
						this.$trigger.bind({
							mouseenter: function(){self.open(self.settings.showDelay)},
							mouseleave: function(){self.close(self.settings.hideDelay)},
							mouseup: function(e){e.stopPropagation()}
						});
						break;
					case 'focus':
						this.$trigger.bind({
							focus: function(){self.open(self.settings.showDelay)},
							blur: function(){self.close(self.settings.hideDelay)},
							mouseup: function(e){e.stopPropagation()}
						});
						break;
				}
				break;

			case 'inline':
				this.bindSpecialActions();
				break;
		}
	}

	// Auto-open if set
	if (this.settings.auto)
		this.open();
};

mgExternal.prototype = {

	defaults: {},

	isVisible: function() {
		if (this.settings.display == 'inline') {
			return true;
		} else {
			return this.$container && this.$container.is(':visible') && this.$container.css('visibility') != 'hidden';
		}
	},

	open: function(delay) {
		var self = this;
		this._show = true;
		setTimeout(function(){self._open()}, delay || 10);
	},

	_open: function() {

		if (!this._show)
			return;

		var self = this;

		// New content
		if (this.settings.renew || !this.$container) {
			this.settings.ajaxUrl = this._defaultAjaxUrl;
			this._lastSubmitName = null;

			var url = this.settings.ajaxUrl || this.$trigger.attr('href');

			if (this._defaultContent) {
				this.setContent(this._defaultContent);
			} else if (url.match(/\.(jpg|gif|png|bmp|jpeg)(.*)?$/i)) {
				this.setContent('<img src="'+url+'" style="display:block;" />');
				setTimeout(function(){
					self.moveContainer();
				}, 1000);
			} else {
				this.loadAjaxContent();
			}
		}
		// Show existing content
		else {
			this.showContainer();
		}
	},

	close: function(delay) {
		var self = this;
		this._show = false;
		setTimeout(function(){self._close()}, delay || 10);
	},

	_close: function() {

		if (this._show || !this.isVisible() || this.settings.onBeforeClose.call(this) === false || this.settings.display == 'inline')
			return;

		var self = this;

		if (this.settings.display == 'tooltip' && this.settings.overlayOpacity > 0) {
			this.$trigger.removeClass(this.settings.tooltip.activeClass).css({
				position: this._triggerZIndexBackup.position,
				zIndex: this._triggerZIndexBackup.zIndex
			});
		}

		// Fade container out
		this.$container.fadeOut(this.settings.hideSpeed, function(){

			// If set to be destroyed, remove the content and bindings,
			// and call onDestroy
			if (self.settings.destroyOnClose)
				self.destroy();

			if (self.settings.overlayOpacity > 0 && self.settings.display == 'modal') {
				$('#mgExternal-overlay').fadeOut(self.settings.hideSpeed, function(){
					self.settings.onClose.call(self);
				});
			} else {
				self.settings.onClose.call(self);
			}
		});

		if (this.settings.overlayOpacity > 0 && this.settings.display != 'modal')
			$('#mgExternal-overlay').fadeOut(this.settings.hideSpeed);

	},

	setContent: function(html) {

		var self = this;

		if (!this.$container && this.settings.display != 'inline')
			this.createElements();

		// We remove the margin for the first DIV element due to aesthetical
		// reasons. If you wish to maintain those proportions, you should set
		// the equivalent padding in settings.dataCss
		this.$content
			.html(html)
			.children()
				.css({
					marginLeft: 0,
					marginRight: 0
				})
				.first()
					.css('margin-top', '0')
					.end()
				.last()
					.css('margin-bottom', '0');

		if (!this.isVisible())
			this.$container.css('visibility', 'hidden').show();

		this.bindSpecialActions();
		this.settings.onContentReady.call(this);
		this.setFocus();

		if (this.settings.display != 'inline') {
			if (this.isVisible()) {
				this.moveContainer();
			} else {
				this.$container.hide().css('visibility', 'visible');
				this.showContainer();
			}
		}
	},

	showContainer: function() {

		if (this.settings.onBeforeShow.call(this) === false)
			return;

		var self = this;

		if (this.settings.display == 'tooltip' && this.settings.overlayOpacity > 0) {
			this._triggerZIndexBackup = {
				position: this.$trigger.css('position') == 'static' ? '' : this.$trigger.css('position'),
				zIndex: this.$trigger.css('z-index') == 0 ? '' : this.$trigger.css('z-index')
			};
			this.$trigger.addClass(this.settings.tooltip.activeClass).css({
				position: this._triggerZIndexBackup.position ? null : 'relative',
				zIndex: 998
			});
		}

		// Fade container in, and call onShow. If it's a modal, fade
		// overlay in before
		var fadeInContainer = function(){
			self.$container.fadeIn(self.settings.showSpeed, function(){
				self.settings.onShow.call(self);
				self.setFocus();
			});
		};
		if (this.settings.overlayOpacity > 0) {
			var $overlay = $('#mgExternal-overlay');
			$overlay.css({
				background: this.settings.overlayColor,
				opacity: this.settings.overlayOpacity
			});

			if (this.settings.display == 'modal') {
				$overlay.fadeIn(this.settings.showSpeed, fadeInContainer);
			} else {
				$overlay.fadeIn(this.settings.showSpeed);
				fadeInContainer();
			}
		} else {
			fadeInContainer();
		}

		// Reposition the container
		this.moveContainer(true);
		this.$container.find('img').bind('load', function(){
			self.moveContainer(true);
		});
	},

	// TODO: remove bindings
	destroy: function() {
		this.$container.remove();
		this.settings.onDestroy.call(this);
	},

	bindSpecialActions: function() {
		var self = this;
		this.$content.find('form').bind('submit', function(e){
			self.loadAjaxContent($(this));
			e.preventDefault();
		});
		this.$content.find('.mgExternal-redirect').bind('click', function(e){
			self.settings.ajaxUrl = $(this).attr('href');
			self.loadAjaxContent();
			e.preventDefault();
		});
		this.$content.find('.mgExternal-close').bind('click', function(e){
			self.close();
			e.preventDefault();
		});
		var onLoad = this.$content.find('.mgExternal-onLoad').data('mgExternal-onLoad');
		if (onLoad)
			onLoad.call(this);
	},

	loadAjaxContent: function(submit) {
		var self = this,
			ajaxData = $.extend({}, self.settings.ajaxData);

		if (submit) {
			this._lastSubmitName = submit.find(this.settings.submitIdentifier).val();
			submit.find(':input').each(function(){
				if ($(this).is(':checkbox')) {
					ajaxData[$(this).attr('name')] = $(this).prop('checked') ? 1 : 0;
				} else if ($(this).is(':radio')) {
					if ($(this).prop('checked'))
						ajaxData[$(this).attr('name')] = $(this).val();
				} else {
					ajaxData[$(this).attr('name')] = $(this).val();
				}
			});
		}

		// We'll use an iframe as an ajax workaround if we're dealing with file uploads
		if (submit && submit.attr('enctype') == 'multipart/form-data') {

			// Create a random ID for the new iframe
			var iframeName = 'mgExternal-iframe'+Math.floor(Math.random()*99999);

			// Create the iframe
			$('<iframe name="'+iframeName+'" id="'+iframeName+'" src="" style="display:none;"></iframe>')
				.appendTo('body')
				.bind('load', function(){
					var response = $(this).contents().find('body').html();
					// Is it a JSON object?
					try {
						var data = eval('('+response+')');
						if (typeof data == 'object') {
							self.settings.onJsonData.call(self, data);
							return;
						}
					} catch (err) {}
					// ... or just plain HTML?
					self.setContent(response);
				});

			// Leave a visible copy of the form for usability reasons (we'll move the original)
			submit.clone().insertAfter(submit);

			// Add ajaxData vars as hidden inputs
			$.each(this.settings.ajaxData, function(name, value){
				submit.append('<input type="hidden" name="'+name+'" value="'+value+'" />');
			});

			// Move form inside the iframe (Chrome had issues otherwise)
			submit.appendTo($('#'+iframeName))
				  .attr('action', this.settings.ajaxUrl || this.$trigger.attr('href'))
				  .attr('target', iframeName)
				  .append('<input type="hidden" name="is_iframe" value="true" />')
				  .unbind('submit')
				  .trigger('submit');
		} else {
			$.ajax({
				url: this.settings.ajaxUrl || this.$trigger.attr('href'),
				type: submit ? 'POST' : 'GET',
				data: ajaxData,
				success: function(data){
					if (typeof data == 'object') {
						self.settings.onJsonData.call(self, data);
					} else {
						self.setContent(data);
					}
				},
				error: function(jqXHR, textStatus, errorThrown){
					self.setContent('<div class="notice alert">S\'ha produït un error</div>');
				}
			});
		}

		this.$content.find(':input').prop('disabled', true).addClass('disabled');
	},

	setFocus: function() {

		if (!this.settings.autoFocus)
			return;

		var form = this.$content.find(this.settings.submitIdentifier+'[value="'+this._lastSubmitName+'"]').parents('form:visible');

		if (form.length == 0)
			form = this.$content.find('form:first:visible');

		if (form.length == 0)
			form = this.$content;

		for (var i = 0, firstInput = form.find(this.settings.focusPriority[i]);
		     firstInput.length == 0 && i <= this.settings.focusPriority.length;
		     firstInput = form.find(this.settings.focusPriority[++i]));

		setTimeout(function(){
			firstInput.trigger('focus');
		}, 10);
	},

	createElements: function() {

		var self = this;

		if (!this.$container) {
			this.$container = $('<div/>')
				.addClass('mgExternal-container')
				.addClass(this.settings.extraClass)
				.css({
					position: 'absolute',
					zIndex: 999
				})
				.hide()
				.appendTo('body')
				.bind('mouseup', function(e){
					e.stopPropagation(); // Required if outsideClose is set to true.
										 // mouseup event is used instead of click
										 // due to IE incompatibility
				});

			this.$data = $('<div/>')
				.addClass('mgExternal-data')
				.css(this.settings.dataCss)
				.appendTo(this.$container)
				.append(this.$content);

			if (this.settings.tooltip.bind == 'hover') {
				this.$container.bind('mouseenter', function(){self.open(self.settings.showDelay)});
				this.$container.bind('mouseleave', function(){self.close(self.settings.hideDelay)});
			}

			// Resize re-position
			$(window).bind('resize', function(){self.moveContainer()});

			if (this.settings.display == 'tooltip')
				$(window).bind('scroll', function(){self.moveContainer()});

			// Hide on outside click or ESC
			if (this.settings.outsideClose) {

				// Actually using mouseup event due to IE incompatibility.
				// Also using body instead of document as clicking on the scroll bar
				// triggers the event on the latter, closing the container.
				$('body').bind('mouseup', function(e){
					if (e.which == 1)
						self.close();
				});
			}

			if (this.settings.escClose) {
				$(document).bind('keyup', function(e){
					if (e.keyCode == 27)
						self.close();
				});
			}

			self.settings.onCreateElements.call(self);
		}

		if (this.settings.overlayOpacity > 0 && $('#mgExternal-overlay').length == 0) {
			this.$modalOverlay = $('<div/>')
				.attr('id', 'mgExternal-overlay')
				.css({
					height: $('body').height(), // 100% doesn't work properly on touchscreens
					left: 0,
					position: 'absolute',
					top: 0,
					width: $('body').width(), // 100% doesn't work properly on touchscreens
					zIndex: 997
				})
				.hide()
				.appendTo('body');
		}

		if (!this.$tooltipArrow && this.settings.display == 'tooltip' && this.settings.tooltip.arrowSize) {
			this.$tooltipArrow = $('<div/>')
				.addClass('mgExternal-arrow')
				.css({
					position: 'absolute'
				})
				.appendTo(this.$container)
				.append($('<div/>')
					.addClass('mgExternal-arrow-shadow')
					.css({
						borderColor: this.settings.tooltip.arrowBorderColor,
						borderStyle: 'solid',
						borderWidth: this.settings.tooltip.arrowSize
					})
				)
				.append($('<div/>')
					.addClass('mgExternal-arrow-front')
					.css({
						borderColor: this.settings.tooltip.arrowFrontColor || this.$data.css('backgroundColor'),
						borderStyle: 'solid',
						position: 'absolute',
						borderWidth: this.settings.tooltip.arrowSize
					}
				));
		}
	},

	moveContainer: function(force) {

		if (!force && !this.isVisible())
			return;

		switch (this.settings.display) {
			case 'modal':
				this.moveModal();
				break;
			case 'tooltip':
				this.moveTooltip();
				break;
		}
	},

	moveModal: function() {
		var top = 0,
		    left = 0,
		    containerHeight = this.$container.outerHeight(true),
		    containerWidth = this.$container.outerWidth(true);

		if (containerHeight < $(window).height())
			top = $(document).scrollTop() + (($(window).height() - containerHeight) / 2) - 15;
		if (top < ($(document).scrollTop() + 15))
			top = $(document).scrollTop() + 15;

		left = ($(window).width() - containerWidth) / 2;
		if (left < 15)
			left = 15;

		if (this.settings.modal.animateSpeed > 0)
			this.$container.stop().animate({top: top, left: left, opacity: 1}, this.settings.modal.animateSpeed);
		else
			this.$container.css({top: top, left: left, opacity: 1});
	},

	moveTooltip: function() {

		//---[ Fix narrow blocks past body width ]----------------------------//

		var $tempContainer = this.$container.clone();

		$tempContainer
			.css({
				left: 0,
				top: 0,
				position: 'absolute',
				visibility: 'hidden'
			})
			.children()
				.css({
					height: '',
					width: ''
				})
				.end()
			.appendTo('body');

		this.$data
			.css('height', this.settings.dataCss.height || '').css('height', $tempContainer.children().height())
			.css('width', this.settings.dataCss.width || '').css('width',  $tempContainer.children().width());

		$tempContainer.remove();

		//---[ Useful vars ]--------------------------------------------------//

		var pos = {top: 0, left: 0},
		    breatheSeparation = 15,
		    windowHeight = $(window).height(),
		    windowWidth = $(window).width(),
		    containerHeight = this.$container.outerHeight(true),
		    containerWidth = this.$container.outerWidth(true),
		    sourceOffset = this.settings.tooltip.positionSource.offset(),
		    sourceHeight = this.settings.tooltip.positionSource.outerHeight(),
		    sourceWidth = this.settings.tooltip.positionSource.outerWidth(),
		    distance = this.settings.tooltip.distance,
		    arrowSize = this.settings.tooltip.arrowSize,
		    arrowDistance = this.settings.tooltip.arrowDistance,
		    scrollTop = $(document).scrollTop(),
		    scrollLeft = $(document).scrollLeft(),
		    position = this.settings.tooltip.position.split(' ')[0],
		    modifier = this.settings.tooltip.position.split(' ')[1];

		//---[ Fit in window 1 ]----------------------------------------------//

		if (position == 'bottom' && windowHeight < (sourceOffset.top - scrollTop + sourceHeight + containerHeight + breatheSeparation))
			position = 'top';

		if (position == 'top' && (sourceOffset.top - scrollTop - breatheSeparation) < containerHeight)
			position = 'bottom';

		if (position == 'right' && windowWidth < (sourceOffset.left - scrollLeft + sourceWidth + containerWidth + breatheSeparation))
			position = 'left';

		if (position == 'left' && (sourceOffset.left - scrollLeft - breatheSeparation) < containerWidth)
			position = 'right';

		//---[ Position ]-----------------------------------------------------//

		switch (position) {
			case 'top':
				pos.top = sourceOffset.top - containerHeight - distance - arrowSize;
				break;
			case 'bottom':
				pos.top = sourceOffset.top + sourceHeight + distance + arrowSize;
				break;
			case 'left':
				pos.left = sourceOffset.left - containerWidth - distance - arrowSize;
				break;
			case 'right':
				pos.left = sourceOffset.left + sourceWidth + distance + arrowSize;
				break;
		}

		//---[ Modifier ]-----------------------------------------------------//

		switch (modifier) {
			case 'top':
				pos.top = sourceOffset.top;
				break;
			case 'middle':
				pos.top = sourceOffset.top - (containerHeight/2) + (sourceHeight/2);
				break;
			case 'bottom':
				pos.top = sourceOffset.top - containerHeight + sourceHeight;
				break;
			case 'left':
				pos.left = sourceOffset.left;
				break;
			case 'center':
				pos.left = sourceOffset.left - (containerWidth/2) + (sourceWidth/2);
				break;
			case 'right':
				pos.left = sourceOffset.left - containerWidth + sourceWidth;
				break;
		}

		//---[ Fit in window 2 ]----------------------------------------------//

		var move, posFit;

		if (position == 'left' || position == 'right') {
			posFit = {
				pos: 'top',
				source: sourceHeight,
				sourceOffset: sourceOffset.top,
				container: containerHeight,
				window: windowHeight,
				scroll: scrollTop
			};
		} else {
			posFit = {
				pos: 'left',
				source: sourceWidth,
				sourceOffset: sourceOffset.left,
				container: containerWidth,
				window: windowWidth,
				scroll: scrollLeft
			};
		}

		while ((pos[posFit.pos] - posFit.scroll + posFit.container + breatheSeparation) > posFit.window) {
			move = false;
			if (posFit.container >= posFit.source) {
				if ((pos[posFit.pos] + posFit.container) > (posFit.sourceOffset + posFit.source))
					move = true;
			} else {
				if (pos[posFit.pos] > posFit.sourceOffset)
					move = true;
			}
			if (move) pos[posFit.pos]--; else break;
		}

		while ((pos[posFit.pos] - posFit.scroll) < breatheSeparation) {
			move = false;
			if (posFit.container >= posFit.source) {
				if (pos[posFit.pos] < posFit.sourceOffset)
					move = true;
			} else {
				if ((pos[posFit.pos] + posFit.container) < (posFit.sourceOffset + posFit.source))
					move = true;
			}
			if (move) pos[posFit.pos]++; else break;
		}

		if (arrowSize && posFit.source < (arrowSize + arrowDistance*2)) {
			var arrowSeparationTop = posFit.sourceOffset + (posFit.source / 2) - arrowSize - pos[posFit.pos],
			    arrowSeparationBottom = pos[posFit.pos] + posFit.container - posFit.sourceOffset - (posFit.source / 2) - arrowSize;

			if (!(arrowSeparationTop < arrowDistance && arrowSeparationBottom < arrowDistance)) {
				if (arrowSeparationTop < arrowDistance) {
					pos[posFit.pos] = posFit.sourceOffset + (posFit.source / 2) - arrowSize - arrowDistance;
				}
				if (arrowSeparationBottom < arrowDistance) {
					pos[posFit.pos] = posFit.sourceOffset - posFit.container + (posFit.source / 2) + arrowSize + arrowDistance;
					arrowSeparationTop = posFit.sourceOffset + (posFit.source / 2) - arrowSize - pos[posFit.pos];
				}
				arrowSeparationTop = posFit.sourceOffset + (posFit.source / 2) - arrowSize - pos[posFit.pos];
			    arrowSeparationBottom = pos[posFit.pos] + posFit.container - posFit.sourceOffset - (posFit.source / 2) - arrowSize;
				if (arrowSeparationTop < arrowDistance || arrowSeparationBottom < arrowDistance)
					pos[posFit.pos] = posFit.sourceOffset - ((posFit.container - (arrowSize * 2)) / 2);
			}
		}

		//---[ Arrow ]--------------------------------------------------------//

		if (arrowSize) {
			if (!this.$tooltipArrow)
				this.createElements();

			this.$tooltipArrow.show();

			if (position == 'top' || position == 'bottom') {
				this.$tooltipArrow.css({
					height: arrowSize,
					left: (containerWidth < sourceWidth)
						? (containerWidth / 2) - arrowSize
						: (sourceOffset.left - pos.left) + (sourceWidth / 2) - arrowSize,
					top: position == 'top' ? '' : -arrowSize,
					width: arrowSize*2
				}).find('div').css({
					borderLeftColor: 'transparent',
					borderRightColor: 'transparent',
					borderBottomWidth: position == 'top' ? 0 : arrowSize,
					borderTopWidth: position == 'bottom' ? 0 : arrowSize
				}).filter('.mgExternal-arrow-front').css({
					left: 0,
					top: (position == 'top' ? '-' : '')+this.$data.css('borderBottomWidth')
				});
			} else {
				this.$tooltipArrow.css({
					height: arrowSize*2,
					left: position == 'left' ? '' : -arrowSize,
					right: position == 'right' ? '' : -arrowSize,
					top: (containerHeight < sourceHeight)
						? (containerHeight / 2) - arrowSize
						: (sourceOffset.top - pos.top) + (sourceHeight / 2) - arrowSize,
					width: arrowSize
				}).find('div').css({
					borderBottomColor: 'transparent',
					borderTopColor: 'transparent',
					borderLeftWidth: position == 'right' ? 0 : arrowSize,
					borderRightWidth: position == 'left' ? 0 : arrowSize
				}).filter('.mgExternal-arrow-front').css({
					left: (position == 'left' ? '-' : '')+this.$data.css('borderBottomWidth'),
					top: 0
				});
			}
		} else if (this.$tooltipArrow) {
			this.$tooltipArrow.hide();
		}

		this.$container.css(pos);
	}
};

})(jQuery);